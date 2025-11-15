/*
  authMiddleware.js
  Modularisasi: Memisahkan middleware otentikasi.
  
  PERBAIKAN KEAMANAN (SANGAT PENTING):
  - Mengganti 'jwt.decode()' (tidak aman) dengan 'jwt.verify()' (aman).
  - Ini sekarang secara kriptografis memvalidasi token, bukan hanya membacanya.
*/
const jwt = require('jsonwebtoken');
// ** PERUBAHAN: Impor JWT_SECRET untuk verifikasi **
const { JWT_SECRET } = require('./db.js');

const authenticateJWT = (req, res, next) => {
  const authHeader = req.headers.authorization;
  
  if (authHeader) {
    const token = authHeader.split(' ')[1]; // Bearer <token>
    
    try {
      // ** PERUBAHAN KEAMANAN: dari jwt.decode() ke jwt.verify() **
      // Ini memverifikasi bahwa token ditandatangani oleh SECRET kita
      const decoded = jwt.verify(token, JWT_SECRET); 
      
      req.user = decoded; // Menambahkan info user (misal: { userId, license }) ke request
      console.log(`Middleware: Request diautentikasi sebagai ${req.user.userId}`);
      next();
    } catch (err) {
      // Error ini akan muncul jika token tidak valid ATAU kadaluarsa
      console.log('Middleware: Token tidak valid atau kadaluarsa', err.message);
      return res.sendStatus(403); // Forbidden
    }
  } else {
    console.log('Middleware: Header otorisasi tidak ditemukan.');
    res.sendStatus(401); // Unauthorized
  }
};

module.exports = { authenticateJWT };