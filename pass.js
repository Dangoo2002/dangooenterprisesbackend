const bcrypt = require('bcrypt');

const storedHash = '$2b$10$q0cmDLHMopR7xArBnQ/W3uvnmxbudML7yqTcxG3lK8d1Dn2BoqnWi';
const plainPassword = '@Kennarwana2002';

bcrypt.compare(plainPassword, storedHash, (err, result) => {
  if (result) {
    console.log('Password matches the hash.');
  } else {
    console.log('Password does not match the hash.');
  }
});
