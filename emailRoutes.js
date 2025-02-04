const express = require('express');
const {sendEmail} = require('./emailService')


const router = express.Router();

router.post("/send", async (req, res) => {
  const { to, subject, text } = req.body;

  try {
    const result = await sendEmail(to, subject, text);
    res.status(200).json({ message: "Email sent successfully!", result });
  } catch (error) {
    res.status(500).json({ message: "Failed to send email", error });
  }
});

export default router;
