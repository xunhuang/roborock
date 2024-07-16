"use strict";

const fs = require('fs');

const mqtt = require('mqtt')
const crypto = require('crypto');
const Parser = require('binary-parser').Parser;
const CRC32 = require('crc-32');
const zlib = require('zlib');
const EventEmitter = require('node:events');


const command = process.argv[2] || 'app_pause';

const userdataFilename = 'userdata.json';
const homedataFilename = 'homedata.json';

const rriot = JSON.parse(fs.readFileSync(userdataFilename, 'utf8')).rriot;
const homedata = JSON.parse(fs.readFileSync(homedataFilename, 'utf8'));

const devices = homedata.devices.concat(homedata.receivedDevices);
const localKeys = new Map(devices.map(device => [device.duid, device.localKey]));

let seq = 1;
let random = 4711; // Should be initialized with a number 0 - 1999?
let idCounter = 1;

const endpoint = md5bin(rriot.k).subarray(8, 14).toString('base64'); // Could be a random but rather static string. The app generates it on first run.
const nonce = crypto.randomBytes(16);

// This value is stored hardcoded in librrcodec.so, encrypted by the value of "com.roborock.iotsdk.appsecret" from AndroidManifest.xml.
const salt = 'TXdfu$jyZ#TZHsg4';

const rr = new EventEmitter();

const mqttMessageParser = new Parser()
  .endianess('big')
  .string('version', { length: 3 })
  .uint32('seq')
  .uint32('random')
  .uint32('timestamp')
  .uint16('protocol')
  .uint16('payloadLen')
  .buffer('payload', { length: 'payloadLen' })
  .uint32('crc32');

const protocol301Parser = new Parser()
  .endianess('little')
  .string('endpoint', { length: 15, stripNull: true })
  .uint8('unknown1')
  .uint16('id')
  .buffer('unknown2', { length: 6 });

const mqttUser = md5hex(rriot.u + ':' + rriot.k).substring(2, 10);
const mqttPassword = md5hex(rriot.s + ':' + rriot.k).substring(16);
const client = mqtt.connect(rriot.r.m, { username: mqttUser, password: mqttPassword, keepalive: 30 })


function _encodeTimestamp(timestamp) {
  const hex = timestamp.toString(16).padStart(8, '0').split('');
  return [5, 6, 3, 7, 1, 2, 0, 4].map(idx => hex[idx]).join('');
}

async function sendRequest(deviceId, method, params, secure = false) {
  const timestamp = Math.floor(Date.now() / 1000);
  let requestId = idCounter++;
  let inner = { id: requestId, method: method, params: params };
  if (secure) {
    inner.security = { endpoint: endpoint, nonce: nonce.toString('hex').toUpperCase() };
  }
  let payload = JSON.stringify({ t: timestamp, dps: { '101': JSON.stringify(inner) } });
  return new Promise((resolve, reject) => {
    rr.on('response.102', (deviceId, id, result) => {
      if (id == requestId) {
        if (secure) {
          if (result !== 'ok') {
            reject(result);
          }
        } else {
          resolve(result);
        }
      }
    });
    if (secure) {
      rr.on('response.301', (deviceId, id, result) => {
        if (id == requestId) {
          resolve(result);
        }
      });
    }
    sendMsgRaw(deviceId, 101, timestamp, payload);
  });
}

function sendMsgRaw(deviceId, protocol, timestamp, payload) {
  const localKey = localKeys.get(deviceId);
  const aesKey = md5bin(_encodeTimestamp(timestamp) + localKey + salt);
  const cipher = crypto.createCipheriv('aes-128-ecb', aesKey, null);
  const encrypted = Buffer.concat([cipher.update(payload), cipher.final()]);
  const msg = Buffer.alloc(23 + encrypted.length);
  msg.write('1.0');
  msg.writeUint32BE(seq++ & 0xffffffff, 3);
  msg.writeUint32BE(random++ & 0xffffffff, 7);
  msg.writeUint32BE(timestamp, 11);
  msg.writeUint16BE(protocol, 15);
  msg.writeUint16BE(encrypted.length, 17);
  encrypted.copy(msg, 19);
  const crc32 = CRC32.buf(msg.subarray(0, msg.length - 4)) >>> 0;
  msg.writeUint32BE(crc32, msg.length - 4);
  client.publish(`rr/m/i/${rriot.u}/${mqttUser}/${deviceId}`, msg);
}


function md5hex(str) {
  return crypto.createHash('md5').update(str).digest('hex');
}
function md5bin(str) {
  return crypto.createHash('md5').update(str).digest();
}

client.on('connect', function () {
  client.subscribe(`rr/m/o/${rriot.u}/${mqttUser}/#`, function (err, granted) {
    if (!err) {
      const deviceId = devices[0].duid; // Simply use the first device.
      sendRequest(deviceId, command, [], true).then(result => {
        console.log("all done", result);
      });
    }
  })
})