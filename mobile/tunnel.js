const ngrok = require('@expo/ngrok');
ngrok.connect({ addr: 3000, authtoken_from_env: false })
  .then(url => console.log('NGROK_URL=' + url))
  .catch(err => console.error(err));
