function emailLayout(title, content){

  return `
  <div style="
    background:#f1f5f9;
    padding:40px 15px;
    font-family:Segoe UI,sans-serif;
  ">

    <div style="
      max-width:650px;
      margin:auto;
      background:white;
      border-radius:24px;
      overflow:hidden;
      box-shadow:0 10px 30px rgba(0,0,0,0.08);
    ">

      <!-- HEADER -->
      <div style="
        background:linear-gradient(135deg,#2563eb,#7c3aed);
        padding:35px;
        text-align:center;
        color:white;
      ">

        <h1 style="
          margin:0;
          font-size:32px;
        ">
          🎓 EduBridge
        </h1>

        <p style="
          margin-top:10px;
          opacity:0.9;
        ">
          Modern Learning Platform
        </p>

      </div>

      <!-- BODY -->
      <div style="
        padding:40px 30px;
        color:#0f172a;
        line-height:1.8;
      ">

        <h2 style="
          margin-top:0;
          color:#111827;
        ">
          ${title}
        </h2>

        ${content}

      </div>

      <!-- FOOTER -->
      <div style="
        background:#f8fafc;
        padding:25px;
        text-align:center;
        font-size:14px;
        color:#64748b;
      ">

        <p>
          By using EduBridge,
          you agree to our
          Terms & Conditions
          and Privacy Policy.
        </p>

        <p style="margin-top:10px;">
          © 2026 EduBridge.
          All rights reserved.
        </p>

      </div>

    </div>

  </div>
  `;
}

module.exports = {
  emailLayout
};