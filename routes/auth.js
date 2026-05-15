const express = require("express");
const router = express.Router();
const pool = require("../config/db");
const bcrypt = require("bcrypt");
const sendEmail = require("../utils/mailer");
const { emailLayout } =
require("../utils/emailTemplates");
const crypto = require("crypto");


// =========================
// 📄 SIGNUP PAGE
// =========================
router.get("/signup", (req, res) => {
  res.render("student/signup", { error: null });
});


// =========================
// 📄 LOGIN PAGE
// =========================
router.get("/login", (req, res) => {
  res.render("student/login", { error: null });
});


// =========================
// 📝 SIGNUP + VERIFY EMAIL
// =========================
router.post("/signup", async (req, res) => {
  if(!req.body.agreeTerms){
  return res.render("student/signup",{
    error:"You must agree to Terms & Privacy Policy"
  });
}
  try {
    const { name, email, password } = req.body;

    // ❗ check existing user
    const existing = await pool.query(
      "SELECT * FROM users WHERE email=$1",
      [email]
    );

    if (existing.rows.length > 0) {
      return res.render("student/signup", {
        error: "Email already registered"
      });
    }

    // 🔐 hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // 🔑 generate token
    const token = crypto.randomBytes(32).toString("hex");

    // ✅ insert user with token
    const result = await pool.query(
      `INSERT INTO users 
(
  name,
  email,
  password,
  role,
  verification_token,
  terms_accepted,
  privacy_accepted,
  accepted_at
)

VALUES (
  $1,$2,$3,$4,$5,
  true,
  true,
  NOW() 
)

RETURNING *`,
      [name, email, hashedPassword, "student", token]
    );

    const user = result.rows[0];

    // 📧 SEND VERIFICATION EMAIL
await sendEmail(
  user.email,
  "Verify your EduBridge account",

  emailLayout(
    "Verify Your Email",

    `
    <p>
      Hello <strong>${user.name}</strong>,
    </p>

    <p>
      Welcome to EduBridge 🚀
    </p>

    <p>
      Thank you for creating your account.
    </p>

    <p>
      By creating your account,
      you agreed to our
      Terms & Conditions
      and Privacy Policy.
    </p>

    <div style="margin:35px 0;">

      <a
        href="${process.env.BASE_URL}/verify/${token}"

        style="
          background:#2563eb;
          color:white;
          padding:14px 22px;
          text-decoration:none;
          border-radius:12px;
          display:inline-block;
          font-weight:600;
        "
      >
        Verify Account
      </a>

    </div>

    <p>
      If you did not create this account,
      please ignore this email.
    </p>
    `
  )
).catch(err => console.error("Email failed:", err));

    res.render("student/login", {
      error: "Verification email sent. Please check your inbox."
    });

  } catch (err) {
    console.error("Signup Error:", err);

    res.render("student/signup", {
      error: "Signup failed. Try again."
    });
  }
});


// =========================
// 🔗 VERIFY EMAIL
// =========================
router.get("/verify/:token", async (req, res) => {
  try {
    const { token } = req.params;

    const result = await pool.query(
      "SELECT * FROM users WHERE verification_token=$1",
      [token]
    );

    if (result.rows.length === 0) {
      return res.send("Invalid or expired verification link");
    }

    const user = result.rows[0];
// 🎉 WELCOME EMAIL
await sendEmail(
  user.email,
  "Welcome to EduBridge",

  emailLayout(
    "Welcome to EduBridge 🚀",

    `
    <p>
      Hello <strong>${user.name}</strong>,
    </p>

    <p>
      Your EduBridge account
      has been created successfully.
    </p>

    <p>
      We are excited to have you
      in our learning community.
    </p>

    <p>
      During signup,
      you agreed to our:
    </p>

    <ul>
      <li>Terms & Conditions</li>
      <li>Privacy Policy</li>
    </ul>

    <p>
      Please verify your email
      to activate your account.
    </p>
    `
  )
).catch(console.error);
    await pool.query(
      "UPDATE users SET is_verified=true, verification_token=NULL WHERE id=$1",
      [user.id]
    );

    res.send(`
      <h2>Email verified successfully</h2>
      <a href="/login">Go to Login</a>
    `);

  } catch (err) {
    console.error("Verify Error:", err);
    res.send("Verification failed");
  }
});


// =========================
// 🔐 LOGIN
// =========================
router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    const result = await pool.query(
      "SELECT * FROM users WHERE email=$1",
      [email]
    );

    const user = result.rows[0];

    if (!user) {
      return res.render("student/login", {
        error: "User not found"
      });
    }

    const isMatch = await bcrypt.compare(password, user.password);

    if (!isMatch) {
      return res.render("student/login", {
        error: "Invalid password"
      });
    }

    // 🚫 BLOCK IF NOT VERIFIED
    if (!user.is_verified) {
      return res.render("student/login", {
        error: "Please verify your email first"
      });
    }

    if (user.is_blocked) {

  req.session.blockedUser = {
    id: user.id,
    email: user.email
  };

  return res.redirect("/blocked");
}



    // ✅ session
  req.session.user = {
  id: user.id,
  name: user.name,
  email: user.email,
  role: user.role,
  xp: user.xp || 0
};
// 🎡 DAILY SPIN POPUP CHECK

const today = new Date()
  .toISOString()
  .split("T")[0];

req.session.showSpinWheel =
  !user.last_spin_popup ||
  user.last_spin_popup.toISOString()
    .split("T")[0] !== today;

// UPDATE LAST POPUP DATE

await pool.query(
  "UPDATE users SET last_spin_popup=NOW() WHERE id=$1",
  [user.id]
);

    res.redirect("/");

  } catch (err) {
    console.error("Login Error:", err);

    res.render("student/login", {
      error: "Login failed. Try again."
    });
  }
});




// =========================
// 🚪 LOGOUT
// =========================
router.get("/logout", (req, res) => {
  req.session.destroy(() => {
    res.redirect("/login");
  });
});

module.exports = router;