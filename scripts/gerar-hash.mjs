// Gera ADMIN_PASSWORD_HASH (bcrypt) e um SESSION_SECRET forte para colar no .env.local.
// A senha é digitada aqui, sem eco, e nada é gravado em arquivo.
import { randomBytes } from "node:crypto";
import { createInterface } from "node:readline";
import { Writable } from "node:stream";
import process from "node:process";
import bcrypt from "bcryptjs";

let mudo = false;
const saida = new Writable({
  write(chunk, codificacao, cb) {
    if (!mudo) process.stdout.write(chunk, codificacao);
    cb();
  },
});
const rl = createInterface({ input: process.stdin, output: saida, terminal: true });

rl.question("Senha do admin: ", (senha) => {
  mudo = false;
  rl.close();
  process.stdout.write("\n");
  if (senha.length < 8) {
    console.error("Use ao menos 8 caracteres.");
    process.exit(1);
  }
  // No .env.local o "$" precisa ir escapado ("\$"), senão o Next expande e corrompe o hash.
  const hash = bcrypt.hashSync(senha, 10).replace(/\$/g, "\\$");
  console.log("Cole estas linhas no .env.local:\n");
  console.log(`ADMIN_PASSWORD_HASH=${hash}`);
  console.log(`SESSION_SECRET=${randomBytes(48).toString("base64url")}`);
});
mudo = true;
