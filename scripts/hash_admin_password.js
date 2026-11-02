// Genera ADMIN_PASSWORD_HASH ("scrypt:<salt hex>:<hash hex>") para el login de administrador.
// Uso: node scripts/hash_admin_password.js  (pide la contraseña sin mostrarla)
const crypto = require("crypto");
const readline = require("readline");

const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
rl._writeToOutput = (s) => {
  if (!rl.stdoutMuted) rl.output.write(s);
};
rl.question("Contraseña: ", (password) => {
  rl.close();
  process.stdout.write("\n");
  if (!password) {
    console.error("Contraseña vacía");
    process.exit(1);
  }
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(password, salt, 64);
  console.log(`ADMIN_PASSWORD_HASH=scrypt:${salt.toString("hex")}:${hash.toString("hex")}`);
  console.log(`ADMIN_SESSION_SECRET=${crypto.randomBytes(32).toString("hex")}`);
});
rl.stdoutMuted = true;
