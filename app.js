const express = require("express");
const path = require("path");
const session = require("express-session");
require("dotenv").config();

const expressLayouts = require("express-ejs-layouts");

const app = express();

// Middleware
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// Static
app.use(express.static(path.join(__dirname, "public")));

// Session
app.use(
  session({
    secret: process.env.SESSION_SECRET || "secret123",
    resave: false,
    saveUninitialized: false,
  })
);

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

// Home
app.get("/", (req, res) => {
  if (!req.session.user) return res.redirect("/login");

  if (req.session.user.role === "admin") {
    return res.redirect("/admin/dashboard");
  } else {
    return res.redirect("/courses");
  }
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