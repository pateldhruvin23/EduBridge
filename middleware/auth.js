// =========================
// ✅ CHECK LOGIN
// =========================
function isLoggedIn(req, res, next) {

  // normal logged in user
  if (req.session.user) {
    return next();
  }

  // blocked user
  if (req.session.blockedUser) {
    return res.redirect("/blocked");
  }

  // not logged in
  return res.redirect("/login");
}


// =========================
// ✅ CHECK ADMIN
// =========================
function isAdmin(req, res, next) {

  if (
    req.session.user &&
    req.session.user.role === "admin"
  ) {
    return next();
  }

  return res.redirect("/login");
}


// =========================
// ✅ EXPORT
// =========================
module.exports = {
  isLoggedIn,
  isAdmin
};