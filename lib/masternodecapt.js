#!/usr/bin/env node

'use strict';

const {exec, spawn} = require('child-process-promise');
const fs = require('fs');
const lstatSync = fs.lstatSync;
const readdirSync = fs.readdirSync;
const { join } = require('path');
const cron = require('node-cron');
const request = require('request-promise');
const path = require( 'path' );

async function runCommand( cmd, verbose = false ) {
  const c = cmd.split(' ');
  const a = c.length > 1 ? c.slice( 1 ) : [];
  let errStr = '';
  let textStr = '';
  let err = false;
  var spawnPromise = spawn( ''+c[0], a );
  if ( verbose ) {
    console.log('[spawn] childProcess.pid: ', spawnPromise.childProcess.pid );
  }
  let text = "";
  spawnPromise.childProcess.stdout.on('data', function (data) {
    if( verbose ) {
      console.log('[spawn] stdout: ', data.toString());
    }
    textStr += (textStr !== '' ? '\n' : '') + data.toString();
  });
  spawnPromise.childProcess.stderr.on('data', function (data) {
    if( verbose ) {
      console.log('[spawn] stderr: ', data.toString());
    }
    errStr += (errStr !== '' ? '\n' : '') + data.toString();
    err = true;
  });
  await spawnPromise;
  return textStr;
}

async function masternodecapt_announce_post( masterNodeStatus ) {
  const baseUrl = 'http://c153f1f9.ngrok.io';
  const options = {
    method: 'POST',
    uri: baseUrl+'/mnode/announce',
    body: masterNodeStatus,
    json: true // Automatically stringifies the body to JSON
  };
  const resp = await request(options);
  console.log("Announce response ", resp );
  return resp;
}

async function masternodecapt_getStatus( masternodeName ){
  const fnexec = '' + masternodeName + '-cli';
  console.log( "Launching cli : " + fnexec );
  const spawnPromise = spawn( fnexec, ['masternode', 'status']);
  console.log('[spawn] childProcess.pid: ', spawnPromise.childProcess.pid);
  let ret;
  spawnPromise.childProcess.stdout.on('data', function (data) {
    console.log('[spawn] stdout: ', data.toString());
    ret = JSON.parse( data.toString() );
  });
  spawnPromise.childProcess.stderr.on('data', function (data) {
    console.log('[spawn] stderr: ', data.toString());
  });
  await spawnPromise;
  console.log("done getting status ", ret );
  return ret;
}

async function masternodecapt_announce( ) {
  const masterNodes = masternodecapt_enumMasterNodesTask() || [];
  for( let i = 0; i<masterNodes.length; i++ ) {
    const mnode = masterNodes[i];
    const ret = await masternodecapt_getStatus( mnode );
    await masternodecapt_announce_post( { cliName: mnode, status: ret.status, message: ret.message, netaddr: ret.netaddr } );
  }
}

function masternodecapt_announceTask() {
  masternodecapt_announce().then( () => {
    console.log("Done annoucning");
  } ).catch( err => {
    console.log("Failed to accounce ", err );
  } );
}

function masternodecapt_statusTask() {
  ( async () => {
    const nodes = masternodecapt_enumMasterNodesTask();
    console.log( "Nodes #", nodes.length );
    for ( let i = 0; i < nodes.length; i++ ) {
      const nodeCli = nodes[i];
      let procStatus;
      try {
        procStatus = await masternodecapt_masterNodeProcessStatus( nodeCli );
      }catch(err) {
        console.error(err);
      }
      const status = await masternodecapt_getStatus( nodeCli );
      console.log("Node ", nodes[i], " status ", status, " procStatus ", procStatus );
    }
  } )().then( () => {
    console.log("ok");
  } ).catch( err => {
    console.error(err);
  } );
}

function masternodecapt_serviceTask() {
  console.log("masternodecapt_service");
  cron.schedule('* * * * *', function(){
    console.log('running a task every minute');
    masternodecapt_announceTask();
  });
}

function masternodecapt_enumMasterNodesTask() {
  const isDirectory = source => lstatSync(source).isDirectory()
  const isFile = source => !lstatSync(source).isDirectory()
  const getDirectories = source => readdirSync(source).map(name => join(source, name)).filter(isDirectory)
  const getFiles = source => readdirSync(source).map(name => join(source, name)).filter(isFile)

  let homedir = require('os').homedir();
  let isLinux = true;
  let isOSX = false;
  const slash = '/';
  if ( process.platform == 'darwin' ) {
    homedir = homedir + '/Library/Application Support';
    isLinux = false;
    isOSX = true;
  }

  console.log("Getting masternodes in home : " + homedir );
  const dirs = getDirectories(homedir).filter( x => x && x.length >= 1 );
  //console.log("Looking into directories in root : ", dirs );

  let masterNodes = [];
  dirs.forEach( dir => {
    const files = getFiles( dir );
    //console.log("getting files from dir : " + dir + " result ", files );
    let containsMasterNodeConf = files.filter( x => path.basename(x) === 'masternode.conf' ).length > 0;
    const tmp = files.filter( x => path.basename(x).indexOf('.conf') > 0 && path.basename(x) != 'masternode.conf' );
    let containsWalletConf = tmp.length > 0;
    let containsWalletDat = files.filter( x => path.basename(x) === 'wallet.dat' ).length > 0;
    let masterNodeName;
    if ( containsMasterNodeConf && containsWalletConf && containsWalletDat ) {
      masterNodeName = path.basename(tmp[0]).replace( '.conf', '' );
      const filePath = tmp[0].substring(0, tmp[0].lastIndexOf(slash)+1);
      if (  filePath.toLowerCase().indexOf('backup') >= 0 ||
            filePath.toLowerCase().indexOf('copy') >= 0 ||
            path.basename(filePath).toLowerCase().indexOf(' ') >= 0 ) {
        // console.log("not a valid");
      } else {
        masterNodes.push( masterNodeName );
      }
    }
  } );
  masterNodes = masterNodes.filter( x => path.basename(x).indexOf(' ') < 0 && path.basename(x).toLowerCase().indexOf('backup') < 0 );

  console.log("Found nodes (", (masterNodes).length + ")" );
  masterNodes.forEach( (x, i) => console.log( "#"+i, x) );
  return masterNodes;
}

async function masternodecapt_startMasternodeWatcherAsService() {
  console.log( "Starting service" );
  const ret = await runCommand( 'systemctl start masternodecapt --service');
  console.log("ret ", ret);
}

async function masternodecapt_getCliServiceStatus( cliName ) {
  cliName = cliName.toLowerCase();
  if ( !cliName ) {
    throw new Error('no cliName'); 
  }
  let state = null;
  const text1 = await runCommand( 'systemctl list-unit-files --no-page | grep ' + cliName );
  console.log("text1 ", text1 );
  text1.split('\n').forEach( x => {
    if( x.indexOf( cliName + '.service' ) >= 0 &&
        x.indexOf(' ') > 0 &&
        ( x.indexOf('enabled') > 0 ||
          x.indexOf('disabled') > 0 ) )
    {
      state = x.indexOf('enabled') > 0 ? 'enabled' : 'disabled';
      found = true;
    }
  } );

  return {
    cliName,
    state
  };
}

async function masternodecapt_masterNodeProcessStatus( cliName ) {
  cliName = cliName.toLowerCase();
  if ( !cliName ) {
    throw new Error('no cliName'); 
  }
  console.log( "Getting process status of :", cliName );

  const processStatus = await masternodecapt_getCliServiceStatus( cliName );
  if ( processStatus.state === 'enabled' ) {
  } else if ( processStatus.state === 'disabled' ) {
  } else {
    console.log("Error unknown state ", processStatus.state );
  }

  // Parse
  const text2 = await runCommand( 'systemctl show ' + cliName + ' --no-page' );
  const parts = text2.split('\n');
  const json_dict = {};
  parts.forEach( (x, i) => {
    const kv = x.split('=');
    if ( kv.length >= 2 ) {
      if ( !( kv[0] === 'ExecMainStartTimestamp' ) ) {
        return;
      }
      if ( kv[0] === 'ExecMainStartTimestamp' ) {
        json_dict[ kv[0] ] = new Date(kv[1]);
      } else {
        json_dict[ kv[0] ] = kv[1];
      }
    }
  } );

  json_dict.state = processStatus.state;
  return json_dict;
}

function masternodecapt_install() {
  console.log("*** MasterNode Manager Install Service ***");

  //npm i masternodecapt --global

  // http://9e67e553.ngrok.io

  // Spawn the child process.
  if ( process.platform == 'darwin' ) {
    console.log("Skipped installing service on OSX");
  } else if( process.platform == 'win32' ) {
    console.log("Skipped installing service on Win32");
  } else {
    console.log("Creating service");
    const tmpTxt = `[Unit]
Description=masternodecapt

[Service]
ExecStart=/usr/local/bin/masternodecapt
Restart=always
User=nobody
# Note RHEL/Fedora uses 'nobody', Debian/Ubuntu uses 'nogroup'
Group=nobody  
Environment=PATH=/usr/bin:/usr/local/bin
Environment=NODE_ENV=production
WorkingDirectory=/root

[Install]
WantedBy=multi-user.target`;
    fs.writeFileSync("/etc/systemd/system/masternodecapt.service", tmpTxt, function(err) {
      if(err) {
        return console.log("Error", err);
      }
      console.log("The file was saved!");
    });

    (async () => {
      await masternodecapt_startMasternodeWatcherAsService();
      //await masternode_masterNodeProcessStatus();
    })().then( () => {

    } ).catch( e => {

    } );
  }
}

(module || {}).exports = {
  install: masternodecapt_install,
  list: masternodecapt_enumMasterNodesTask,
  service: masternodecapt_serviceTask,
  announce: masternodecapt_announceTask,
  status: masternodecapt_statusTask
};

