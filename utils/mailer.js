const { Resend } = require("resend");

const resend = new Resend(process.env.RESEND_API_KEY);

async function sendEmail(to, subject, html) {

  const response = await resend.emails.send({

    from: "EduBridge <onboarding@resend.dev>",

    to,

    subject,

    html

  });

  console.log("✅ Email sent:", response);

  return response;
}

module.exports = sendEmail;