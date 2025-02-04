require("dotenv").config();
const { google } = require("googleapis");

async function getAccessToken() {
  try {
    const oauth2Client = new google.auth.OAuth2(
      process.env.GMAIL_CLIENT_ID,
      process.env.GMAIL_CLIENT_SECRET,
      "https://developers.google.com/oauthplayground"
    );

    // Ensure refresh token exists
    if (!process.env.GMAIL_REFRESH_TOKEN) {
      throw new Error("🚨 Refresh token is missing in environment variables");
    }

    oauth2Client.setCredentials({ refresh_token: process.env.GMAIL_REFRESH_TOKEN });

    const accessToken = await oauth2Client.getAccessToken();

    console.log("✅ Access Token:", accessToken.token);
    console.log("ℹ️ Token Expiry:", accessToken.res?.data?.expiry_date || "Unknown");
  } catch (error) {
    console.error("❌ Error fetching access token:", {
      message: error.message,
      code: error.code,
      response: error.response?.data
    });
    process.exit(1);
  }
}

getAccessToken();
