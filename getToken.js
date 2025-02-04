const { google } = require("googleapis");

const oauth2Client = new google.auth.OAuth2(
  "234922297762-unl9r2oso32d1fhlotbe4e8s7nj9cbk5.apps.googleusercontent.com",
  "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",
  "https://developers.google.com/oauthplayground"
);

oauth2Client.setCredentials({
  refresh_token: "1//04QEXCISk27jxCgYIARAAGAQSNwF-L9IrsLpNB4oKRnQALaoPIvgIcr-S4M1bSn9KWSNsyevlu0N7UhhivQIUUx3icYim6QBfZGc",
});

async function getAccessToken() {
  const { token } = await oauth2Client.getAccessToken();
  console.log("Access Token:", token);
}

getAccessToken();
