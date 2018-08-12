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

async function masternodecapt_getstatus( masternodeName ){
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
  const masterNodes = masternodecapt_enumMasterNodes() || [];
  for( let i = 0; i<masterNodes.length; i++ ) {
    const mnode = masterNodes[i];
    const ret = await masternodecapt_getstatus( mnode );
    await masternodecapt_announce_post( { name: mnode, status: ret.status, message: ret.message } );
  }
}

function masternodecapt_announceTask() {
  masternodecapt_announce().then( () => {
    console.log("Done annoucning");
  } ).catch( err => {
    console.log("Failed to accounce ", err );
  } );
}

function masternodecapt_service() {
  console.log("masternodecapt_service");
  cron.schedule('* * * * *', function(){
    console.log('running a task every minute');
    masternodecapt_announceTask();
  });
}

function masternodecapt_enumMasterNodes() {
  const isDirectory = source => lstatSync(source).isDirectory()
  const isFile = source => !lstatSync(source).isDirectory()
  const getDirectories = source => readdirSync(source).map(name => join(source, name)).filter(isDirectory)
  const getFiles = source => readdirSync(source).map(name => join(source, name)).filter(isFile)

  let homedir = '/root/';
  let isLinux = true;
  let isOSX = false;
  const slash = '/';
  if ( process.platform == 'darwin' ) {
    homedir = require('os').homedir() + '/Library/Application Support';
    isLinux = false;
    isOSX = true;
  }

  console.log("Getting masternodes in home : " + homedir );
  const dirs = getDirectories(homedir).filter( x => x && x.length >= 1 && (!isLinux || x[0] === '.') );
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
      if ( filePath.toLowerCase().indexOf('backup') >= 0 || filePath.toLowerCase().indexOf(' ') >= 0 ) {
        console.log("not a valid");
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

    console.log("Starting service");
    var spawnPromise = spawn('systemctl', ['start', 'masternodecapt', '--service']);
    console.log('[spawn] childProcess.pid: ', spawnPromise.childProcess.pid);
    spawnPromise.childProcess.stdout.on('data', function (data) {
        console.log('[spawn] stdout: ', data.toString());
    });
    spawnPromise.childProcess.stderr.on('data', function (data) {
        console.log('[spawn] stderr: ', data.toString());
    });
    spawnPromise.then( () => {
      console.log("Process ended...");
    } ).catch(function (err) {
        console.error('[spawn] ERROR: ', err);
    });
  }

}

(module || {}).exports = {
  install: masternodecapt_install,
  list: masternodecapt_enumMasterNodes,
  service: masternodecapt_service,
  announce: masternodecapt_announceTask
};

