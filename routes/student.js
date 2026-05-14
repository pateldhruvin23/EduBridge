const express = require("express");
const router = express.Router();
const pool = require("../config/db");
const { isLoggedIn } = require("../middleware/auth");
const crypto = require("crypto");
const bcrypt = require("bcrypt");
const uploadImage = require("../config/memoryUpload");
const { marked } = require("marked");
const { emailLayout } = require("../utils/emailTemplates");

// 🎓 View all courses
const sendEmail = require("../utils/mailer");

async function shouldShowSpinWheel(userId){

  const spin = await pool.query(
    `
    SELECT *
    FROM daily_spins
    WHERE user_id=$1
    `,
    [userId]
  );

  // NEVER SPUN
  if(spin.rows.length === 0){
    return true;
  }

  const lastSpin = new Date(
    spin.rows[0].last_spin
  );

  const now = new Date();

  const diff =
    (now - lastSpin) / 1000 / 60 / 60;

  // SHOW AGAIN AFTER 24 HOURS

  return diff >= 24;
}

router.get("/courses", isLoggedIn, async (req, res) => {
  const userId = req.session.user.id;
const notifications = await pool.query(`
  SELECT 
    n.id AS notification_id,   -- ✅ FIXED
    n.message,
    un.is_read
  FROM user_notifications un
  JOIN notifications n ON n.id = un.notification_id
  WHERE un.user_id=$1
  ORDER BY n.id DESC
  LIMIT 5
`, [userId]);
  const courses = await pool.query("SELECT * FROM courses");

  const enrolled = await pool.query(
    "SELECT course_id FROM enrollments WHERE user_id=$1",
    [userId]
  );

  const enrolledIds = enrolled.rows.map(e => e.course_id);

  // 🔥 calculate progress per course
  let progressMap = {};

  for (let course of courses.rows) {
    const totalVideos = await pool.query(
      "SELECT COUNT(*) FROM videos WHERE course_id=$1",
      [course.id]
    );

    const completed = await pool.query(
      `SELECT COUNT(*) FROM progress p
       JOIN videos v ON p.video_id = v.id
       WHERE p.user_id=$1 AND v.course_id=$2 AND p.completed=true`,
      [userId, course.id]
    );

    const total = parseInt(totalVideos.rows[0].count);
    const done = parseInt(completed.rows[0].count);

    progressMap[course.id] = total === 0 ? 0 : Math.round((done / total) * 100);
  }



  res.render("student/courses", {
    layout: "student/layout",
    user: req.session.user,
    courses: courses.rows,
    enrolledIds,
    progressMap,
     notifications: notifications.rows ,
     showSpinWheel: await shouldShowSpinWheel(userId)
     
  });
  req.session.showSpinWheel = false;
});

// 🎬 Course Detail
router.get("/course/:id", isLoggedIn, async (req, res) => {
  const userId = req.session.user.id;
  const courseId = req.params.id;

  // ✅ Skip enrollment for admin
  if (req.session.user.role !== "admin") {
    const enrolled = await pool.query(
      "SELECT * FROM enrollments WHERE user_id=$1 AND course_id=$2",
      [userId, courseId]
    );

    if (enrolled.rows.length === 0) {
      return res.redirect("/courses");
    }
  }

  // 📚 Course
  const course = await pool.query(
    "SELECT * FROM courses WHERE id=$1",
    [courseId]
  );

  // 🎬 Videos
  const videos = await pool.query(
    "SELECT * FROM videos WHERE course_id=$1 ORDER BY order_index ASC",
    [courseId]
  );

  // 📄 Notes
  const notes = await pool.query(
    "SELECT * FROM notes WHERE course_id=$1",
    [courseId]
  );

  // 📊 Progress
  const progress = await pool.query(
    "SELECT * FROM progress WHERE user_id=$1",
    [userId]
  );

  // 🔥 Completed videos (for locking system)
  const completedVideos = await pool.query(
    "SELECT video_id FROM progress WHERE user_id=$1 AND completed=true",
    [userId]
  );

  const completedIds = completedVideos.rows.map(v => v.video_id);

  // ▶️ Resume last watched
  const lastWatched = await pool.query(
    "SELECT video_id FROM progress WHERE user_id=$1 ORDER BY video_id DESC LIMIT 1",
    [userId]
  );

  // 💬 Comments
  const comments = await pool.query(
    "SELECT * FROM comments WHERE course_id=$1 ORDER BY created_at DESC",
    [courseId]
  );
  // after fetching videos
const quizzes = await pool.query(
  "SELECT * FROM quizzes WHERE video_id = ANY($1)",
  [videos.rows.map(v => v.id)]
);

// user results
const results = await pool.query(
  "SELECT video_id, passed FROM quiz_results WHERE user_id=$1",
  [userId]
);

const passedMap = {};
results.rows.forEach(r => {
  passedMap[r.video_id] = r.passed;
});


  let startVideo = videos.rows[0];

  if (lastWatched.rows.length > 0) {
    const found = videos.rows.find(
      v => v.id === lastWatched.rows[0].video_id
    );
    if (found) startVideo = found;
  }

  // 🚀 FINAL RENDER
res.render("student/course-detail", {
  layout: "student/layout",
  user: req.session.user,
  course: course.rows[0],
  videos: videos.rows,
  startVideo,
  notes: notes.rows,
  comments: comments.rows,
  completedIds,
  quizzes: quizzes.rows,
  passedMap // 🔥 IMPORTANT
  ,
    showSpinWheel:
  req.session.showSpinWheel || false,
  });
  req.session.showSpinWheel = false;
});


// 📱 Reels
router.get("/reels", isLoggedIn, async (req, res) => {
  const result = await pool.query("SELECT * FROM reels ORDER BY id DESC");

  res.render("student/reels", {
    layout: "student/layout", // ✅ FIX
    user: req.session.user,
    reels: result.rows,
      showSpinWheel: await shouldShowSpinWheel(userId)
  });
  req.session.showSpinWheel = false;
});


// 🎯 Enroll
router.post("/enroll", isLoggedIn, async (req, res) => {
  const userId = req.session.user.id;
  const { courseId } = req.body;

  await pool.query(
    `INSERT INTO enrollments (user_id, course_id)
     VALUES ($1,$2)
     ON CONFLICT (user_id, course_id) DO NOTHING`,
    [userId, courseId]
  );

  res.redirect("/course/" + courseId);
});

// 🏆 UNLOCK COURSE WITH XP

router.post("/unlock-course", isLoggedIn, async (req,res)=>{

  try{

    const userId = req.session.user.id;

    const { courseId } = req.body;

    // GET COURSE
    const course = await pool.query(
      "SELECT * FROM courses WHERE id=$1",
      [courseId]
    );

    if(course.rows.length === 0){
      return res.send("Course not found");
    }

    const c = course.rows[0];

    // GET USER XP
    const user = await pool.query(
      "SELECT xp FROM users WHERE id=$1",
      [userId]
    );

    const xp = user.rows[0].xp;

    // CHECK XP
    if(xp < c.xp_required){
      return res.send("Not enough XP");
    }

    // DEDUCT XP
    await pool.query(
      "UPDATE users SET xp = xp - $1 WHERE id=$2",
      [c.xp_required, userId]
    );

    // ENROLL
    await pool.query(
      `INSERT INTO enrollments
       (user_id, course_id)

       VALUES($1,$2)

       ON CONFLICT DO NOTHING`,
      [userId, courseId]
    );

    // UPDATE SESSION XP
    req.session.user.xp =
      xp - c.xp_required;

    res.redirect("/course/" + courseId);

  }catch(err){

    console.error(err);

    res.send("Unlock failed");

  }

});

// 💬 Comment
router.post("/comment", isLoggedIn, async (req, res) => {
  const userId = req.session.user.id;
  const { courseId, message } = req.body;

  await pool.query(
    "INSERT INTO comments (user_id, course_id, message) VALUES ($1,$2,$3)",
    [userId, courseId, message]
  );

  res.redirect("/course/" + courseId);
});


// 📊 Track
router.post("/track", isLoggedIn, async (req, res) => {
  const userId = req.session.user.id;
  const { videoId, action } = req.body;

  await pool.query(
    "INSERT INTO analytics (user_id, video_id, action) VALUES ($1,$2,$3)",
    [userId, videoId, action]
  );

  res.json({ ok: true });
});


// ✅ Complete video
router.post("/complete-video", isLoggedIn, async (req, res) => {
  const { videoId } = req.body;
  const userId = req.session.user.id;

  await pool.query(
    "UPDATE progress SET last_watched=false WHERE user_id=$1",
    [userId]
  );

  await pool.query(
    `INSERT INTO progress (user_id, video_id, completed, last_watched)
     VALUES ($1,$2,true,true)
     ON CONFLICT (user_id, video_id)
     DO UPDATE SET completed=true, last_watched=true`,
    [userId, videoId]
  );

  res.json({ success: true });
});

router.post("/submit-quiz", isLoggedIn, async (req, res) => {
  const userId = req.session.user.id;
  const { videoId, correct } = req.body;

  // 🔍 check existing attempts
  const existing = await pool.query(
    "SELECT * FROM quiz_results WHERE user_id=$1 AND video_id=$2",
    [userId, videoId]
  );

  let attempts = 1;

  if (existing.rows.length > 0) {
    attempts = existing.rows[0].attempts + 1;
  }

  let passed = correct;

  // ❗ allow move after 2 attempts
  if (attempts >= 2) {
    passed = true;
  }

  // 💾 save result
  await pool.query(
    `INSERT INTO quiz_results (user_id, video_id, attempts, passed)
     VALUES ($1,$2,$3,$4)
     ON CONFLICT (user_id, video_id)
     DO UPDATE SET attempts=$3, passed=$4`,
    [userId, videoId, attempts, passed]
  );

  // =========================
  // 🏆 GAMIFICATION START
  // =========================

  if (correct) {
    // ➕ ADD XP
   let earnedXp = 10;

// BONUS XP
if(attempts === 1){
  earnedXp += 5;
}

// LONG QUIZ BONUS
const quizData = await pool.query(
  "SELECT * FROM quizzes WHERE video_id=$1",
  [videoId]
);

if(
  quizData.rows.length > 0 &&
  quizData.rows[0].time_limit >= 120
){
  earnedXp += 15;
}

await pool.query(
  "UPDATE users SET xp = xp + $1 WHERE id=$2",
  [earnedXp, userId]
);
// UPDATE SESSION XP

req.session.user.xp =
  (req.session.user.xp || 0) + earnedXp;

    // 🔍 GET USER XP
    const user = await pool.query(
      "SELECT xp FROM users WHERE id=$1",
      [userId]
    );

    const userXp = user.rows[0].xp;

    // 🏅 GET BADGES USER QUALIFIES
    const badges = await pool.query(
      "SELECT * FROM badges WHERE xp_required <= $1",
      [userXp]
    );

    // 🎖 ASSIGN BADGES
    for (let b of badges.rows) {
      await pool.query(
        `INSERT INTO user_badges (user_id, badge_id)
         VALUES ($1,$2)
         ON CONFLICT DO NOTHING`,
        [userId, b.id]
      );
    }
  }

  // =========================
  // 🏆 GAMIFICATION END
  // =========================

  res.json({ success: true, attempts, passed });
});



router.get("/notifications", isLoggedIn, async (req, res) => {
  const result = await pool.query(`
    SELECT n.*, un.is_read
    FROM user_notifications un
    JOIN notifications n ON n.id = un.notification_id
    WHERE un.user_id=$1
  `, [req.session.user.id]);

  res.render("student/notifications", {
    layout: "student/layout",
    notifications: result.rows
  });
});

router.post("/mark-read", isLoggedIn, async (req, res) => {
  const { notificationId } = req.body;
  const userId = req.session.user.id;

  try {
    await pool.query(
      `UPDATE user_notifications 
       SET is_read=true 
       WHERE notification_id=$1 AND user_id=$2`,
      [notificationId, userId]
    );

    res.json({ success: true });

  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false });
  }
});
router.post("/report-comment", isLoggedIn, async (req, res) => {
  const { commentId, reason } = req.body;

  await pool.query(
    "INSERT INTO reports (comment_id, user_id, reason) VALUES ($1,$2,$3)",
    [commentId, req.session.user.id, reason]
  );

  res.json({ success: true });
});
router.get("/forgot-password", (req, res) => {
  res.render("student/forgot-password", { error: null, success: null });
});
router.post("/forgot-password", async (req, res) => {
  try {
    const { email } = req.body;

    const result = await pool.query(
      "SELECT * FROM users WHERE email=$1",
      [email]
    );

    if (result.rows.length === 0) {
      return res.render("student/forgot-password", {
        error: "No account found with this email",
        success: null
      });
    }

    const user = result.rows[0];

    const token = crypto.randomBytes(32).toString("hex");

    const expiry = new Date(Date.now() + 15 * 60 * 1000); // 15 min

    await pool.query(
      "UPDATE users SET reset_token=$1, reset_token_expiry=$2 WHERE id=$3",
      [token, expiry, user.id]
    );

    // 📧 EMAIL
sendEmail(
  user.email,
  "Reset your EduBridge password",

  emailLayout(
    "Password Reset Request",

    `
    <p>
      Hello <strong>${user.name}</strong>,
    </p>

    <p>
      We received a request
      to reset your password.
    </p>

    <div style="margin:35px 0;">

      <a
        href="http://localhost:3000/reset-password/${token}"

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
        Reset Password
      </a>

    </div>

    <p>
      This link expires in 15 minutes.
    </p>

    <p>
      If you did not request this,
      please ignore this email.
    </p>
    `
  )
).catch(err => console.error("Email failed:", err));

    res.render("student/forgot-password", {
      error: null,
      success: "Reset link sent to your email"
    });

  } catch (err) {
    console.error("Forgot Password Error:", err);

    res.render("student/forgot-password", {
      error: "Something went wrong",
      success: null
    });
  }
});
router.get("/reset-password/:token", async (req, res) => {
  const { token } = req.params;

  const result = await pool.query(
    "SELECT * FROM users WHERE reset_token=$1 AND reset_token_expiry > NOW()",
    [token]
  );

  if (result.rows.length === 0) {
    return res.send("Invalid or expired reset link");
  }

  res.render("student/reset-password", {
    token,
    error: null
  });
});
router.post("/reset-password", async (req, res) => {
  try {
    const { token, password } = req.body;

    const result = await pool.query(
      "SELECT * FROM users WHERE reset_token=$1 AND reset_token_expiry > NOW()",
      [token]
    );

    if (result.rows.length === 0) {
      return res.send("Invalid or expired token");
    }

    const user = result.rows[0];

    const hashed = await bcrypt.hash(password, 10);

    await pool.query(
      `UPDATE users 
       SET password=$1, reset_token=NULL, reset_token_expiry=NULL 
       WHERE id=$2`,
      [hashed, user.id]
    );

    res.render("student/login", {
      error: "Password updated successfully. Please login."
    });

  } catch (err) {
  console.error("Reset Error FULL:", err); // 👈 keep this

  res.render("student/reset-password", {
    error: "Reset failed. Try again.",
    token: req.body.token
  });
}
});




router.post(
  "/unblock-request",
  uploadImage.single("photo"),
  async (req, res) => {

    try {

      const { email, password } = req.body;

      const result = await pool.query(
        "SELECT * FROM users WHERE email=$1",
        [email]
      );

      if (result.rows.length === 0) {
        return res.send("User not found");
      }

      const user = result.rows[0];

      const isMatch = await bcrypt.compare(
        password,
        user.password
      );

      if (!isMatch) {
        return res.render("student/unblock-request", {
          email,
          error: "Password incorrect"
        });
      }

      await pool.query(
        `INSERT INTO unblock_requests
         (user_id, email, password_text, selfie)
         VALUES ($1,$2,$3,$4)`,

        [
          user.id,
          email,
          password,
          req.file.buffer
        ]
      );

      // 📧 EMAIL USER
await sendEmail(
  email,
  "EduBridge Account Review Submitted",

  emailLayout(
    "Request Submitted Successfully",

    `
      <p style="margin-bottom:16px;">
        Hello <strong>${user.name}</strong>,
      </p>

      <p style="margin-bottom:16px;">
        Your unblock request has been submitted successfully.
      </p>

      <p style="margin-bottom:16px;">
        Our admin team will review your request shortly.
      </p>

      <p style="margin-bottom:0;">
        Thank you for your patience and for using EduBridge.
      </p>
    `
  )
);

      res.redirect("/login");

    } catch(err){
      console.error(err);
      res.send("Submission failed");
    }

});

router.post("/submit-unblock-request", async (req,res)=>{

  try{

    if(!req.session.blockedUser){
      return res.send("Session expired");
    }

    const userId = req.session.blockedUser.id;

    const { password, image } = req.body;

    const userResult = await pool.query(
      "SELECT * FROM users WHERE id=$1",
      [userId]
    );

    if(userResult.rows.length === 0){
      return res.send("User not found");
    }

    const user = userResult.rows[0];

    const match = await bcrypt.compare(
      password,
      user.password
    );

    if(!match){
      return res.send("Wrong password");
    }

    // REMOVE BASE64 PREFIX
    const base64Data = image.replace(
      /^data:image\/\w+;base64,/,
      ""
    );

    // CONVERT TO BUFFER
    const buffer = Buffer.from(
      base64Data,
      "base64"
    );

    // CHECK EXISTING PENDING REQUEST
    const existing = await pool.query(
      `SELECT * FROM unblock_requests
       WHERE user_id=$1 AND status='pending'`,
      [userId]
    );

    if(existing.rows.length > 0){
      return res.send("Pending request already exists");
    }

    // INSERT
    await pool.query(
      `INSERT INTO unblock_requests
       (user_id,email,selfie,status)
       VALUES($1,$2,$3,$4)`,
      [
        user.id,
        user.email,
        buffer,
        "pending"
      ]
    );

    // EMAIL
    sendEmail(
      user.email,
      "Unblock Request Submitted",
      `
      <h2>Request Submitted</h2>
      <p>Your unblock request was submitted successfully.</p>
      `
    ).catch(console.error);

    res.send(`
<!DOCTYPE html>
<html lang="en">
<head>

  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">

  <title>Request Submitted</title>

  <!-- Bootstrap -->
  <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/css/bootstrap.min.css" rel="stylesheet">

  <!-- Bootstrap Icons -->
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/bootstrap-icons@1.11.3/font/bootstrap-icons.min.css">

  <style>

    body{
      min-height:100vh;
      display:flex;
      justify-content:center;
      align-items:center;
      background:linear-gradient(135deg,#0f172a,#1e293b,#334155);
      font-family:"Segoe UI",sans-serif;
      overflow:hidden;
      position:relative;
    }

    body::before{
      content:"";
      position:absolute;
      width:500px;
      height:500px;
      background:#22c55e;
      border-radius:50%;
      top:-200px;
      left:-150px;
      filter:blur(120px);
      opacity:0.35;
    }

    body::after{
      content:"";
      position:absolute;
      width:400px;
      height:400px;
      background:#2563eb;
      border-radius:50%;
      bottom:-180px;
      right:-120px;
      filter:blur(120px);
      opacity:0.35;
    }

    .success-card{
      width:100%;
      max-width:480px;
      background:rgba(255,255,255,0.08);
      backdrop-filter:blur(18px);
      border:1px solid rgba(255,255,255,0.12);
      border-radius:28px;
      padding:45px 35px;
      text-align:center;
      color:white;
      box-shadow:0 10px 40px rgba(0,0,0,0.25);
      position:relative;
      z-index:10;
    }

    .icon-box{
      width:90px;
      height:90px;
      margin:auto;
      border-radius:24px;
      background:linear-gradient(135deg,#16a34a,#22c55e);
      display:flex;
      justify-content:center;
      align-items:center;
      font-size:40px;
      box-shadow:0 10px 25px rgba(34,197,94,0.4);
    }

    .title{
      font-size:30px;
      font-weight:700;
      margin-top:25px;
    }

    .subtitle{
      color:#cbd5e1;
      font-size:15px;
      line-height:1.8;
      margin-top:15px;
    }

    .btn-modern{
      height:52px;
      border:none;
      border-radius:14px;
      font-weight:600;
      font-size:15px;
      background:linear-gradient(135deg,#2563eb,#7c3aed);
      transition:0.3s;
    }

    .btn-modern:hover{
      transform:translateY(-2px);
      box-shadow:0 8px 20px rgba(37,99,235,0.4);
    }

  </style>

</head>

<body>

  <div class="success-card">

    <div class="icon-box">
      <i class="bi bi-check-circle-fill"></i>
    </div>

    <h2 class="title">
      Request Submitted Successfully
    </h2>

    <p class="subtitle">
      Your unblock request has been submitted successfully.
      <br><br>
      Our admin team will review your request shortly.
    </p>

    <a href="/login" class="btn btn-primary w-100 btn-modern mt-4">
      Back to Login
    </a>

  </div>

</body>
</html>
`);

  }catch(err){

    console.error("UNBLOCK ERROR:", err);

    res.send("Error submitting request");
  }

});

router.get("/blocked", (req, res) => {

  if (!req.session.blockedUser) {
    return res.redirect("/login");
  }

  res.render("student/blocked");
});
router.get("/unblock-request", (req,res)=>{

  if(!req.session.blockedUser){
    return res.redirect("/login");
  }

  res.render("student/unblock-request");

});

router.get("/account", isLoggedIn, async (req, res) => {

  try {

    const userId = req.session.user.id;

    // 👤 USER
    const userResult = await pool.query(
      "SELECT * FROM users WHERE id=$1",
      [userId]
    );

    // 📚 ENROLLED COURSES
    const courses = await pool.query(`
      SELECT c.*
      FROM enrollments e
      JOIN courses c ON c.id = e.course_id
      WHERE e.user_id=$1
      ORDER BY c.id DESC
    `,[userId]);

    // 🏆 BADGES
    const badges = await pool.query(`
      SELECT b.*
      FROM user_badges ub
      JOIN badges b ON b.id = ub.badge_id
      WHERE ub.user_id=$1
    `,[userId]);

    // rewards
    // 🎡 SPIN REWARDS

const spinRewards = await pool.query(

  `
  SELECT *
  FROM spin_rewards
  WHERE user_id=$1
  ORDER BY id DESC
  LIMIT 10
  `,

  [userId]
);

    // 📊 COMPLETED VIDEOS
    const progress = await pool.query(`
      SELECT COUNT(*) 
      FROM progress
      WHERE user_id=$1
      AND completed=true
    `,[userId]);

    res.render("student/account",{
      layout:"student/layout",
      user:userResult.rows[0],
      courses:courses.rows,
      badges:badges.rows,
      completedVideos:progress.rows[0].count,
      spinRewards:spinRewards.rows,
        showSpinWheel:
  req.session.showSpinWheel || false,
    });
    req.session.showSpinWheel = false;

  } catch(err){

    console.error(err);
    res.send("Account page error");

  }

});

// =========================
// UPDATE PROFILE
// =========================

router.post("/update-profile", isLoggedIn, async (req,res)=>{

  try{

    const userId = req.session.user.id;

    const { name, email } = req.body;

    // CHECK EMAIL EXISTS
    const existing = await pool.query(
      `SELECT * FROM users
       WHERE email=$1
       AND id != $2`,
      [email,userId]
    );

    if(existing.rows.length > 0){

      return res.send("Email already in use");

    }

    // UPDATE USER
    await pool.query(
      `UPDATE users
       SET name=$1,
           email=$2
       WHERE id=$3`,
      [name,email,userId]
    );

    // UPDATE SESSION
    req.session.user.name = name;
    req.session.user.email = email;

    res.redirect("/account");

  }catch(err){

    console.error(err);

    res.send("Profile update failed");

  }

});

// =========================
// STATIC PAGES
// =========================

router.get("/page/:slug", async (req,res)=>{

  try{

    const { slug } = req.params;

    const result = await pool.query(
      "SELECT * FROM site_pages WHERE slug=$1",
      [slug]
    );

    if(result.rows.length === 0){
      return res.send("Page not found");
    }

    const page = result.rows[0];

    // CONVERT MARKDOWN TO HTML
    page.html = marked(page.content);

res.render("student/page",{
  layout: req.session.user
    ? "student/layout"
    : false,

  page,
  user: req.session.user || null
});

  }catch(err){

    console.error(err);

    res.send("Page error");

  }

});

const rewards = [
  { type: "xp", value: 10 },
  { type: "xp", value: 50 },
  { type: "xp", value: 100 },
  { type: "double_xp", value: 1 },
  { type: "premium_unlock", value: 1 },
  { type: "quiz_unlock", value: 1 },
  { type: "nothing", value: 0 }
];

router.post("/spin-wheel", isLoggedIn, async (req,res)=>{

  try{

    const userId = req.session.user.id;

    // =========================
    // CHECK LAST SPIN
    // =========================

    const existing = await pool.query(
      "SELECT * FROM daily_spins WHERE user_id=$1",
      [userId]
    );

    if(existing.rows.length > 0){

      const lastSpin = new Date(
        existing.rows[0].last_spin
      );

      const now = new Date();

      const diff =
        (now - lastSpin) / 1000 / 60 / 60;

      // ⛔ ALREADY SPUN TODAY

      if(diff < 24){

        return res.json({
          error:"Come back tomorrow"
        });

      }

    }

    // =========================
    // RANDOM REWARD
    // =========================

    const reward =
      rewards[
        Math.floor(
          Math.random() * rewards.length
        )
      ];

    // =========================
    // XP REWARD
    // =========================

    if(reward.type === "xp"){

      await pool.query(
        `
        UPDATE users
        SET xp = xp + $1
        WHERE id=$2
        `,
        [reward.value,userId]
      );

      // UPDATE SESSION XP

      req.session.user.xp =
        (req.session.user.xp || 0)
        + reward.value;

    }

    // =========================
    // SAVE REWARD HISTORY
    // =========================

    await pool.query(

      `
      INSERT INTO spin_rewards
      (
        user_id,
        reward_type,
        reward_value
      )

      VALUES($1,$2,$3)
      `,

      [
        userId,
        reward.type,
        reward.value.toString()
      ]
    );

    // =========================
    // SAVE SPIN TIME
    // =========================

    await pool.query(

      `
      INSERT INTO daily_spins
      (
        user_id,
        last_spin
      )

      VALUES($1,NOW())

      ON CONFLICT(user_id)

      DO UPDATE SET
      last_spin=NOW()
      `,

      [userId]
    );

    // =========================
    // RESPONSE
    // =========================

    res.json({
      success:true,
      reward
    });

  }catch(err){

    console.error("SPIN ERROR:",err);

    res.status(500).json({
      error:"Spin failed"
    });

  }

});

router.get("/spin-wheel", isLoggedIn, (req,res)=>{

  res.render("student/spin-wheel");

});
module.exports = router;