#!/usr/bin/env node

'use strict';

const {exec, spawn} = require('child-process-promise');
const fs = require('fs');
const lstatSync = fs.lstatSync;
const readdirSync = fs.readdirSync;
const { join } = require('path');

function masternodecapt_service() {
  console.log("masternodecapt_service");
  cron.schedule('* * * * *', function(){
    console.log('running a task every minute');
  });
}

function masternodecapt_enumMasterNodes() {
  const isDirectory = source => lstatSync(source).isDirectory()
  const isFile = source => !lstatSync(source).isDirectory()
  const getDirectories = source => readdirSync(source).map(name => join(source, name)).filter(isDirectory)
  const getFiles = source => readdirSync(source).map(name => join(source, name)).filter(isFile)

  const dirs = getDirectories('/root').filter( x => x && x.length >= 1 && x[0] === '.' );
  console.log("Looking into directories in root : ", dirs );

  const masterNodes = [];
  dirs.forEach( dir => {
    const files = getFiles( dir );
    let containsMasterNodeConf = files.filter( x => x === 'masternode.conf' ).length > 0;
    const tmp = files.filter( x => x.indexOf('.conf') > 0 && x != 'masternode.conf' );
    let containsWalletConf = tmp.length > 0;
    let containsWalletDat = files.filter( x => x === 'wallet.dat' ).length > 0;
    let masterNodeName;
    if ( containsMasterNodeConf && containsWalletConf && containsWalletDat ) {
      masterNodeName = tmp[0].replace( '.conf', '' );
    }
    masterNodes.push( { masterNodeName } );
  } );

  console.log("MasterNodes:")
  masterNodes.forEach( (x, i) => console.log( "#"+i, x) );
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
  service: masternodecapt_service
};

