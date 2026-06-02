const express = require("express");
const path = require("path");
const session = require("express-session");
const pgSession = require("connect-pg-simple")(session);
require("dotenv").config();

const expressLayouts = require("express-ejs-layouts");

const app = express();
app.set("trust proxy", 1);
// Middleware
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// Static
app.use(express.static(path.join(__dirname, "public")));

// Session
app.use(
  session({

    store: new pgSession({
      conString: process.env.DATABASE_URL
    }),

    secret: process.env.SESSION_SECRET || "secret123",

    resave: false,

    saveUninitialized: false,

    cookie: {

      maxAge: 1000 * 60 * 60 * 24 * 365, // 1 year

      httpOnly: true,

    secure: true,

      sameSite: "lax"
    }

  })
);
app.use((req,res,next)=>{

  res.setHeader(
    "Cache-Control",
    "no-store"
  );

  next();

});
// app.use(
//   session({

//     store: new pgSession({
//       conString: process.env.DATABASE_URL
//     }),

//     secret: process.env.SESSION_SECRET || "secret123",

//     resave: false,

//     saveUninitialized: false,

//     cookie: {

//       maxAge: 1000 * 60 * 60 * 24 * 365,

//       httpOnly: true,

//       // ✅ IMPORTANT FIX
//       secure: process.env.NODE_ENV === "production",

//       sameSite: "lax"
//     }

//   })
// );
// View Engine
app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));

// Layout setup
app.use(expressLayouts);
app.set("layout", false); // important

// Routes
const authRoutes = require("./routes/auth");
const adminRoutes = require("./routes/admin");
const studentRoutes = require("./routes/student");

app.use("/", authRoutes);
app.use("/admin", adminRoutes);
app.use("/", studentRoutes);
app.use(
  "/uploads",
  express.static("uploads", {

    setHeaders: (res, path) => {

      // OPEN PDF INLINE IN IOS
      if(path.endsWith(".pdf")){

        res.setHeader(
          "Content-Type",
          "application/pdf"
        );

        res.setHeader(
          "Content-Disposition",
          "inline"
        );

      }

    }

  })
);
// Home
app.get("/", (req, res) => {

  // User logged in
  if (req.session.user) {

    if (req.session.user.role === "admin") {
      return res.redirect("/admin/dashboard");
    }

    return res.redirect("/courses");
  }

  // Visitor not logged in
  res.render("/student/index");
});

app.get("/about", (req,res)=>{
  res.render("public/about");
});

app.get("/privacy-policy", (req,res)=>{
  res.render("public/privacy-policy");
});

app.get("/terms", (req,res)=>{
  res.render("public/terms");
});

app.get("/contact", (req,res)=>{
  res.render("public/contact");
});

// Server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🔥 Server running on http://localhost:${PORT}`);
});