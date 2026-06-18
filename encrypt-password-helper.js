/**
 * encrypt-password-helper.js
 * ─────────────────────────────────────────────────────────────
 * ใช้สคริปต์นี้เพื่อแปลง plain text password เป็น AES encrypted
 * แล้วนำค่าที่ได้ไปวางใน column "Password" ของ sheet VOC_SuperAdmins
 *
 * วิธีใช้:
 *   node encrypt-password-helper.js <AES_SECRET_KEY> <password>
 *
 * ตัวอย่าง:
 *   node encrypt-password-helper.js "my-super-secret-key" "mypassword123"
 *
 * หมายเหตุ:
 *   - AES_SECRET_KEY ต้องตรงกับที่ตั้งใน Vercel Environment Variables
 *   - ผลลัพธ์แต่ละครั้งจะต่างกัน (random IV) แต่ถอดรหัสได้ถูกต้องทุกครั้ง
 *   - นำค่าที่ได้ไปวางในคอลัมน์ Password ใน sheet ได้เลย
 * ─────────────────────────────────────────────────────────────
 */

const crypto = require('crypto');

const [,, secretKey, plainPassword] = process.argv;

if (!secretKey || !plainPassword) {
  console.error('Usage: node encrypt-password-helper.js <AES_SECRET_KEY> <password>');
  process.exit(1);
}

function encryptPassword(plainText, secret) {
  const key = crypto.createHash('sha256').update(secret).digest();
  const iv  = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);
  const encrypted = Buffer.concat([cipher.update(plainText, 'utf8'), cipher.final()]);
  return iv.toString('hex') + ':' + encrypted.toString('hex');
}

const encrypted = encryptPassword(plainPassword, secretKey);
console.log('\nAES Encrypted Password:');
console.log(encrypted);
console.log('\nคัดลอกค่าด้านบนไปวางในคอลัมน์ "Password" ของ sheet\n');
