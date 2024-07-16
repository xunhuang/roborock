# Extremely Simplfied Roborock API

## Usage

### Installation

```
npm install
node login.js <username> <password>
```

Where username is the email address and password is the password for the account.

The script will save the user data to a file called userdata.json and homedata.json

### running
```
node test.js app_pause
node test.js app_start
node test.js app_charge
```
"app_charge" means return to dock and charge

## Credits

These scripts take heavy inspirations from the following:

-  @rovo89 for https://gist.github.com/rovo89/dff47ed19fca0dfdda77503e66c2b7c7 
- https://github.com/humbertogontijo/python-roborock 
- https://github.com/copystring/ioBroker.roborock/
- https://github.com/marcelrv/XiaomiRobotVacuumProtocol