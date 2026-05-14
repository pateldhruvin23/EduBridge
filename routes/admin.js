const express = require("express");
const router = express.Router();
const pool = require("../config/db");
const { isAdmin } = require("../middleware/auth");
const { fetchPlaylistVideos } = require("../controllers/youtubeController");
const upload = require("../config/upload");
const sendEmail = require("../utils/mailer");
const { marked } = require("marked");
const { emailLayout } =
require("../utils/emailTemplates");
const admin = require("../firebase");
// =========================
// 🎯 DASHBOARD
// =========================
router.get("/dashboard", isAdmin, async (req, res) => {
  try {
    const courses = await pool.query("SELECT * FROM courses ORDER BY id DESC");

    res.render("admin/dashboard", {
      layout: "admin/layout",
      courses: courses.rows
    });

  } catch (err) {
    console.error(err);
    res.status(500).send("Error loading dashboard");
  }
});

// =========================
// 📚 ADD COURSE PAGE
// =========================
router.get("/add-course", isAdmin, (req, res) => {
  res.render("admin/add-course", {
    layout: "admin/layout"
  });
});

// =========================
// 📚 ADD COURSE
// =========================
router.post("/add-course", isAdmin, async (req, res) => {

  try {
   let {
  title,
  description,
  playlist,
  is_premium,
  xp_required
} = req.body;

   if (playlist) {

  playlist = playlist.trim();

  if (playlist.includes("list=")) {

    playlist =
      playlist
        .split("list=")[1]
        .split("&")[0];

  }

} 

    // create course first (no thumbnail yet)
  const courseResult = await pool.query(
  `INSERT INTO courses
   (
     title,
     description,
     youtube_playlist_id,
     created_by,
     is_premium,
     xp_required
   )

   VALUES ($1,$2,$3,$4,$5,$6)

   RETURNING *`,

  [
    title,
    description,
    playlist,
    req.session.user.id,
    is_premium === "true",
    xp_required || 0
  ]
);

    const course = courseResult.rows[0];

   if (playlist) {
  const videos = await fetchPlaylistVideos(playlist);

  // ✅ thumbnail
  if (videos.length > 0 && videos[0].thumbnail) {
    await pool.query(
      "UPDATE courses SET thumbnail=$1 WHERE id=$2",
      [videos[0].thumbnail, course.id]
    );
  }

  // ✅ insert videos
  for (let vid of videos) {
    await pool.query(
      `INSERT INTO videos (course_id, youtube_video_id, title, order_index, thumbnail)
       VALUES ($1,$2,$3,$4,$5)`,
      [course.id, vid.videoId, vid.title, vid.order, vid.thumbnail]
    );
  }

  // =========================
  // 📧 SEND EMAIL TO ENROLLED USERS
  // =========================

  const users = await pool.query(
    `SELECT DISTINCT u.email 
     FROM enrollments e 
     JOIN users u ON u.id = e.user_id 
     WHERE e.course_id=$1`,
    [course.id]
  );

  for (let u of users.rows) {
 sendEmail(
  u.email,
  "🎬 New Course Content Added",

  emailLayout(
    "New Learning Content Available",

    `
    <p>
      New videos were added
      to your enrolled course.
    </p>

    <p>
      <strong>Course:</strong>
      ${course.title}
    </p>

    <div style="margin:35px 0;">

      <a
        href="http://localhost:3000/course/${course.id}"

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
        Continue Learning
      </a>

    </div>

    <p>
      Keep learning and
      continue building your skills 🚀
    </p>
    `
  )
).catch(err => console.error("Email failed:", err)); // ✅ don't crash server
  }
}

    res.redirect("/admin/add-course");
  } catch (err) {
    console.error(err);
    res.status(500).send("Error adding course");
  }
});

// =========================
// 📱 REELS
// =========================
router.post("/add-reel", isAdmin, async (req, res) => {
  try {
    const { title, embed_url } = req.body;

    await pool.query(
      "INSERT INTO reels (title, embed_url) VALUES ($1,$2)",
      [title, embed_url]
    );

    res.redirect("/admin/dashboard");

  } catch (err) {
    console.error(err);
    res.status(500).send("Error adding reel");
  }
});

// =========================
// 📄 NOTES
// =========================
router.post("/add-note", isAdmin, upload.single("pdf"), async (req, res) => {
  try {
    const { courseId, title } = req.body;

    await pool.query(
      "INSERT INTO notes (course_id, title, file_url) VALUES ($1,$2,$3)",
      [courseId, title, req.file.filename]
    );

    res.redirect("/admin/notes");

  } catch (err) {
    console.error(err);
    res.status(500).send("Error uploading note");
  }
});

// =========================
// 📚 COURSES PAGE
// =========================
router.get("/courses", isAdmin, async (req, res) => {
  try {
    const courses = await pool.query("SELECT * FROM courses ORDER BY id DESC");

    res.render("admin/courses", {
      layout: "admin/layout",
      courses: courses.rows
    });

  } catch (err) {
    console.error(err);
    res.status(500).send("Error loading courses");
  }
});

// =========================
// 📁 NOTES PAGE
// =========================
router.get("/notes", isAdmin, async (req, res) => {
  try {
    const notes = await pool.query("SELECT * FROM notes ORDER BY id DESC");

    // 🔥 fetch courses for dropdown
    const courses = await pool.query("SELECT id, title FROM courses ORDER BY id DESC");

    res.render("admin/notes", {
      layout: "admin/layout",
      notes: notes.rows,
      courses: courses.rows
    });

  } catch (err) {
    console.error(err);
    res.status(500).send("Error loading notes");
  }
});
// =========================
// 📱 REELS PAGE
// =========================
router.get("/reels", isAdmin, async (req, res) => {
  try {
    const reels = await pool.query("SELECT * FROM reels ORDER BY id DESC");

    res.render("admin/reels", {
      layout: "admin/layout",
      reels: reels.rows
    });

  } catch (err) {
    console.error(err);
    res.status(500).send("Error loading reels");
  }
});

// =========================
// ✏️ EDIT COURSE
// =========================
router.get("/edit-course/:id", isAdmin, async (req, res) => {
  const result = await pool.query(
    "SELECT * FROM courses WHERE id=$1",
    [req.params.id]
  );

  res.render("admin/edit-course", {
    layout: "admin/layout",
    course: result.rows[0]
  });
});

// =========================
// 💾 UPDATE COURSE
// =========================
router.post("/edit-course/:id", isAdmin, async (req, res) => {
  const { title, description } = req.body;

  await pool.query(
    "UPDATE courses SET title=$1, description=$2 WHERE id=$3",
    [title, description, req.params.id]
  );

  res.redirect("/admin/dashboard");
});

// =========================
// 🗑️ DELETE COURSE
// =========================
router.post("/delete-course/:id", isAdmin, async (req, res) => {
  const courseId = req.params.id;

  await pool.query("DELETE FROM videos WHERE course_id=$1", [courseId]);
  await pool.query("DELETE FROM notes WHERE course_id=$1", [courseId]);
  await pool.query("DELETE FROM enrollments WHERE course_id=$1", [courseId]);
  await pool.query("DELETE FROM courses WHERE id=$1", [courseId]);

  res.redirect("/admin/dashboard");
});
router.post("/add-quiz", isAdmin, async (req, res) => {
  const {
    videoId,
    type,
    question,
    option_a,
    option_b,
    option_c,
    option_d,
    correct_answer,
    starter_code,
    expected_output,
    time_limit
  } = req.body;

  await pool.query(
    `INSERT INTO quizzes
     (video_id, type, question, option_a, option_b, option_c, option_d, correct_answer, starter_code, expected_output, time_limit)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
    [
      videoId,
      type,
      question,
      option_a || null,
      option_b || null,
      option_c || null,
      option_d || null,
      correct_answer || null,
      starter_code || null,
      expected_output || null,
      time_limit || 60
    ]
  );

  res.redirect("/admin/quizzes");
});
router.get("/quizzes", isAdmin, async (req, res) => {
  const courses = await pool.query("SELECT id, title FROM courses");

  res.render("admin/quizzes", {
    layout: "admin/layout",
    courses: courses.rows
  });
});
router.get("/videos/:courseId", isAdmin, async (req, res) => {
  const videos = await pool.query(
    "SELECT id, title FROM videos WHERE course_id=$1 ORDER BY order_index",
    [req.params.courseId]
  );

  res.json(videos.rows);
});

router.get("/analytics", isAdmin, async (req, res) => {
  try {

    const totalUsers = await pool.query("SELECT COUNT(*) FROM users");
    const totalCourses = await pool.query("SELECT COUNT(*) FROM courses");

    const completed = await pool.query(
      "SELECT COUNT(*) FROM progress WHERE completed=true"
    );

    const totalVideos = await pool.query(
      "SELECT COUNT(*) FROM videos"
    );

    const completionRate =
      totalVideos.rows[0].count == 0
        ? 0
        : Math.round(
            (completed.rows[0].count / totalVideos.rows[0].count) * 100
          );

    const quiz = await pool.query(
      "SELECT COUNT(*) FILTER (WHERE passed=true) AS success, COUNT(*) AS total FROM quiz_results"
    );

    const quizSuccess =
      quiz.rows[0].total == 0
        ? 0
        : Math.round((quiz.rows[0].success / quiz.rows[0].total) * 100);

    const enrollments = await pool.query(`
      SELECT c.title, COUNT(e.id) AS count
      FROM courses c
      LEFT JOIN enrollments e ON c.id = e.course_id
      GROUP BY c.title
    `);

    res.render("admin/analytics", {
      layout: "admin/layout",
      stats: {
        totalUsers: totalUsers.rows[0].count || 0,
        totalCourses: totalCourses.rows[0].count || 0,
        completionRate: completionRate || 0,
        quizSuccess: quizSuccess || 0
      },
      enrollments: enrollments.rows || []
    });

  } catch (err) {
    console.error("Analytics Error:", err);

    // ✅ NEVER BREAK UI
    res.render("admin/analytics", {
      layout: "admin/layout",
      stats: {
        totalUsers: 0,
        totalCourses: 0,
        completionRate: 0,
        quizSuccess: 0
      },
      enrollments: []
    });
  }
});

router.get("/users", isAdmin, async (req, res) => {
  const users = await pool.query("SELECT * FROM users");

  res.render("admin/users", {
    layout: "admin/layout",
    users: users.rows
  });
});

router.post("/block-user/:id", isAdmin, async (req, res) => {
  await pool.query(
    "UPDATE users SET is_blocked = NOT is_blocked WHERE id=$1",
    [req.params.id]
  );

  res.redirect("/admin/users");
});


router.post("/delete-comment/:id", isAdmin, async (req, res) => {
  const commentId = req.params.id;

  try {
    await pool.query("DELETE FROM comments WHERE id=$1", [commentId]);
    await pool.query("DELETE FROM reports WHERE comment_id=$1", [commentId]);

    res.redirect("/admin/reports");

  } catch (err) {
    console.error("Delete Error:", err);
    res.redirect("/admin/reports");
  }
});

router.post("/report-comment", isAdmin, async (req, res) => {
  const { commentId, reason } = req.body;

  await pool.query(
    "INSERT INTO reports (comment_id, user_id, reason) VALUES ($1,$2,$3)",
    [commentId, req.session.user.id, reason]
  );

  res.redirect("back");
});

router.post("/send-notification", isAdmin, async (req, res) => {
  const { message, type, courseId } = req.body;

  try {
    // 📩 create notification
    const notif = await pool.query(
      "INSERT INTO notifications (message) VALUES ($1) RETURNING id",
      [message]
    );

    const notificationId = notif.rows[0].id;

    let users;

    if (type === "all") {
      users = await pool.query("SELECT id, email FROM users");
    } else {
      if (!courseId || isNaN(courseId)) {
        return res.send("Invalid courseId");
      }

      users = await pool.query(
        `SELECT u.id, u.email 
         FROM enrollments e
         JOIN users u ON u.id = e.user_id
         WHERE e.course_id=$1`,
        [parseInt(courseId)]
      );
    }

    // 🔥 LOOP USERS
for (let u of users.rows) {

  // 🔔 SAVE APP NOTIFICATION
  await pool.query(
    "INSERT INTO user_notifications (user_id, notification_id) VALUES ($1,$2)",
    [u.id, notificationId]
  );

  // =========================
  // 📱 PUSH NOTIFICATION
  // =========================

  const tokens = await pool.query(
    `
    SELECT token
    FROM device_tokens
    WHERE user_id=$1
    `,
    [u.id]
  );

  for (let t of tokens.rows) {

    await admin.messaging().send({

      token: t.token,

      notification: {
        title: "EduBridge",
        body: message
      },

      data: {
        type: "notification"
      }

    });

  }

  // =========================
  // 📧 EMAIL
  // =========================

  sendEmail(
    u.email,
    "🔔 New EduBridge Notification",

    emailLayout(
      "You Have A New Notification",

      `
      <p>
        ${message}
      </p>

      <div style="margin:35px 0;">

        <a
          href="https://edubridge.online"

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
          Open EduBridge
        </a>

      </div>

      <p>
        Stay updated with
        your learning journey 🚀
      </p>
      `
    )
  ).catch(err => console.error("Email error:", err));

}

    res.redirect("/admin/notifications");

  } catch (err) {
    console.error("Notification Error:", err);
    res.send("Error sending notification");
  }
});




router.post("/toggle-user/:id", isAdmin, async (req, res) => {
  const userId = req.params.id;

  await pool.query(
    "UPDATE users SET is_blocked = NOT is_blocked WHERE id=$1",
    [userId]
  );

  res.redirect("/admin/users");
});

router.get("/reports", isAdmin, async (req, res) => {

  try {
const reports = await pool.query(`
  SELECT 
    r.id,
    r.reason,
    r.comment_id,
    u.name AS user_name,
    c.message
  FROM reports r
  JOIN comments c ON c.id = r.comment_id   -- ✅ CHANGE TO INNER JOIN
  JOIN users u ON u.id = r.user_id
  ORDER BY r.id DESC
`);

    res.render("admin/reports", {
      layout: "admin/layout",
      reports: reports.rows
    });

  } catch (err) {
    console.error(err);
    res.status(500).send("Error loading reports");
  }

});


router.post("/ignore-report/:id", isAdmin, async (req, res) => {

  const reportId = req.params.id;

  await pool.query("DELETE FROM reports WHERE id=$1", [reportId]);

  res.redirect("/admin/reports");
});

router.get("/notifications", isAdmin, async (req, res) => {
  const notifications = await pool.query(
    "SELECT * FROM notifications ORDER BY id DESC"
  );

  res.render("admin/notifications", {
    layout: "admin/layout",
    notifications: notifications.rows
  });
});



router.get("/unblock-requests", isAdmin, async (req, res) => {

  try {

    const result = await pool.query(
      "SELECT * FROM unblock_requests ORDER BY id DESC"
    );

    const requests = result.rows.map(r => {

      let imageBase64 = null;

      if (r.selfie) {
        imageBase64 = r.selfie.toString("base64");
      }

      return {
        ...r,
        imageBase64
      };
    });

   
    

    res.render("admin/unblock-requests", {
      layout: "admin/layout",
      requests
    });

  } catch(err) {

    console.error(err);

    res.send("Error loading requests");
  }

});
router.post("/approve-unblock/:id", isAdmin, async (req,res)=>{

  const requestId = req.params.id;

  const result = await pool.query(
    "SELECT * FROM unblock_requests WHERE id=$1",
    [requestId]
  );

  const request = result.rows[0];

  await pool.query(
    "UPDATE users SET is_blocked=false WHERE id=$1",
    [request.user_id]
  );

  await pool.query(
    `UPDATE unblock_requests
     SET status='approved',
     admin_action_at=NOW()
     WHERE id=$1`,
    [requestId]
  );

await sendEmail(
  request.email,
  "✅ EduBridge Account Restored",

  emailLayout(
    "Your Account Has Been Restored",

    `
    <p>
      Good news 🎉
    </p>

    <p>
      Your EduBridge account
      has been successfully unblocked.
    </p>

    <div style="margin:35px 0;">

      <a
        href="http://localhost:3000/login"

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
        Login Now
      </a>

    </div>

    <p>
      Welcome back to EduBridge 🚀
    </p>
    `
  )
);

  res.redirect("/admin/unblock-requests");

});
router.post("/reject-unblock/:id", isAdmin, async (req,res)=>{

  const requestId = req.params.id;

  const result = await pool.query(
    "SELECT * FROM unblock_requests WHERE id=$1",
    [requestId]
  );

  const request = result.rows[0];

  await pool.query(
    `UPDATE unblock_requests
     SET status='rejected',
     admin_action_at=NOW()
     WHERE id=$1`,
    [requestId]
  );

await sendEmail(
  request.email,
  "❌ Unblock Request Rejected",

  emailLayout(
    "Request Review Completed",

    `
    <p>
      Your unblock request
      was reviewed by our team.
    </p>

    <p>
      Unfortunately,
      the request could not be approved
      at this time.
    </p>

    <p>
      If you believe this is incorrect,
      you may contact support.
    </p>
    `
  )
);

  res.redirect("/admin/unblock-requests");

});

router.get("/site-pages", isAdmin, async (req,res)=>{

  const pages = await pool.query(
    "SELECT * FROM site_pages ORDER BY id"
  );

  res.render("admin/site-pages",{
    layout:"admin/layout",
    pages:pages.rows
  });

});

router.get("/edit-page/:id", isAdmin, async (req,res)=>{

  const result = await pool.query(
    "SELECT * FROM site_pages WHERE id=$1",
    [req.params.id]
  );

  res.render("admin/edit-page",{
    layout:"admin/layout",
    page:result.rows[0]
  });

});

router.post("/edit-page/:id", isAdmin, async (req,res)=>{

  const { title, content } = req.body;

  await pool.query(
    `UPDATE site_pages
     SET title=$1,
         content=$2,
         updated_at=NOW()
     WHERE id=$3`,
    [
      title,
      content,
      req.params.id
    ]
  );

  res.redirect("/admin/site-pages");

});

router.post("/save-device-token", async (req, res) => {

  const { userId, token } = req.body;

  await pool.query(
    `
    INSERT INTO device_tokens (user_id, token)
    VALUES ($1,$2)
    `,
    [userId, token]
  );

  res.json({
    success: true
  });
});

module.exports = router;