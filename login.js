"use strict";

const fs = require('fs');
const axios = require('axios');
const crypto = require('crypto');

const userdataFilename = 'userdata.json';
const homedataFilename = 'homedata.json';

// user name is account's email address
const username = process.argv[2];

// password is account's password. If you sign up with google, you won't have a password to use. you need to use the
// "forget password" feature to reset your password.
const password = process.argv[3];


// the following code basically does the following:
// 1. log in to the account with username and password
// 2. get the access token and save it to a file
// 3. get the home id
// 4. get the home data (with devices info), and save it to a file

// device id can be use in the future for operations and start cleaning etc

async function main() {
  // Initialize the login API (which is needed to get access to the real API).
  const loginApi = axios.create({
    baseURL: 'https://usiot.roborock.com',
    // baseURL: 'https://euiot.roborock.com',
    headers: {
      'header_clientid': crypto.createHash('md5').update(username).update('should_be_unique').digest().toString('base64'),
    },
  });
  // api/v1/getUrlByEmail(email = ...)

  // Try to load existing userdata.
  let userdata;
  if (fs.existsSync(userdataFilename)) {
    userdata = JSON.parse(fs.readFileSync(userdataFilename, 'utf8'));
  } else {
    // Log in.
    console.log('Logging in... ', username, password);
    const res_data = await loginApi.post('api/v1/login', new URLSearchParams({ username: username, password: password, needtwostepauth: 'false' }).toString()).then(res => res.data);
    console.log('res_data', res_data);
    userdata = res_data.data;
    if (userdata) {
      fs.writeFileSync(userdataFilename, JSON.stringify(userdata, null, 2, 'utf8'));
    }

    // Alternative without password:
    // const r = await loginApi.post('api/v1/sendEmailCode', new URLSearchParams({ username: username, type: 'auth' }).toString()).then(res => res.data);
    // console.log('r', r);
    // ... get code from user ...

    // userdata = await loginApi.post('api/v1/loginWithCode', new URLSearchParams({ username: username, verifycode: code, verifycodetype: 'AUTH_EMAIL_CODE' }).toString()).then(res => res.data.data);
    // const code = '860712'; 
    //  userdata = await loginApi.post('api/v1/loginWithCode', new URLSearchParams({ username: username, verifycode: code, verifycodetype: 'AUTH_EMAIL_CODE' }).toString()).then(res => res.data);
    // console.log('userdata', userdata);
    // fs.writeFileSync(userdataFilename, JSON.stringify(userdata, null, 2, 'utf8'));
  }
  loginApi.defaults.headers.common['Authorization'] = userdata.token;
  const rriot = userdata.rriot;

  // Get home details.
  const homeId = await loginApi.get('api/v1/getHomeDetail').then(res => res.data.data.rrHomeId);

  // Initialize the real API.
  const api = axios.create({
    baseURL: rriot.r.a,
  });
  api.interceptors.request.use(config => {
    const timestamp = Math.floor(Date.now() / 1000);
    const nonce = crypto.randomBytes(6).toString('base64').substring(0, 6).replace('+', 'X').replace('/', 'Y');
    const url = new URL(config.baseURL + '/' + config.url);
    const prestr = [rriot.u, rriot.s, nonce, timestamp, md5hex(url.pathname), /*queryparams*/ '', /*body*/ ''].join(':');
    const mac = crypto.createHmac('sha256', rriot.h).update(prestr).digest('base64');
    config.headers.common['Authorization'] = `Hawk id="${rriot.u}", s="${rriot.s}", ts="${timestamp}", nonce="${nonce}", mac="${mac}"`;
    return config;
  });

  const homedata = await api.get(`user/homes/${homeId}`).then(res => res.data.result);
  fs.writeFileSync(homedataFilename, JSON.stringify(homedata, null, 2, 'utf8'));
}
main();

////////////////////////////////////////////////////////////////////////////////////////////////////

function md5hex(str) {
  return crypto.createHash('md5').update(str).digest('hex');
}
