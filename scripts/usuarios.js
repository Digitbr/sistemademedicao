#!/usr/bin/env node
// Gerencia os acessos do Sistema de Medição.
// As senhas ficam guardadas apenas como hash em data/users.json (fora do Git).
//
//   node scripts/usuarios.js adicionar <email> <senha> [nome]
//   node scripts/usuarios.js remover <email>
//   node scripts/usuarios.js listar

import readline from "node:readline";

import { hashPassword, loadUsers, normalizeEmail, saveUsers } from "../lib/auth.js";

const [command, emailArg, passwordArg, ...nameParts] = process.argv.slice(2);

try {
  if (command === "adicionar" || command === "add") {
    await addUser(emailArg, passwordArg, nameParts.join(" "));
  } else if (command === "remover" || command === "remove") {
    removeUser(emailArg);
  } else if (command === "listar" || command === "list") {
    listUsers();
  } else {
    printHelp();
    process.exitCode = command ? 1 : 0;
  }
} catch (error) {
  console.error(`Erro: ${error.message}`);
  process.exitCode = 1;
}

async function addUser(emailValue, passwordValue, nameValue) {
  const email = normalizeEmail(emailValue);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error("Informe um e-mail válido.");
  }

  const password = passwordValue || (await askHidden(`Senha para ${email}: `));
  if (String(password).length < 6) {
    throw new Error("A senha precisa ter pelo menos 6 caracteres.");
  }

  const users = loadUsers().filter((user) => user.email !== email);
  const name = String(nameValue || "").trim() || email.split("@")[0];
  users.push({ email, name, role: "usuario", hash: hashPassword(password) });
  users.sort((a, b) => a.email.localeCompare(b.email));

  const file = saveUsers(users);
  console.log(`Acesso salvo: ${email} (${name})`);
  console.log(`Arquivo: ${file}`);
}

function removeUser(emailValue) {
  const email = normalizeEmail(emailValue);
  const users = loadUsers();
  const remaining = users.filter((user) => user.email !== email);
  if (remaining.length === users.length) {
    throw new Error(`Usuário ${email} não encontrado.`);
  }
  saveUsers(remaining);
  console.log(`Acesso removido: ${email}`);
}

function listUsers() {
  const users = loadUsers();
  if (!users.length) {
    console.log("Nenhum usuário cadastrado.");
    return;
  }
  for (const user of users) console.log(`${user.email}\t${user.name}`);
}

function askHidden(question) {
  if (!process.stdin.isTTY) {
    return Promise.reject(new Error("Informe a senha no comando."));
  }
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    rl._writeToOutput = (text) => {
      if (text.includes(question)) rl.output.write(text);
    };
    rl.question(question, (answer) => {
      rl.close();
      process.stdout.write("\n");
      resolve(answer);
    });
  });
}

function printHelp() {
  console.log(`Uso:
  node scripts/usuarios.js adicionar <email> <senha> [nome]
  node scripts/usuarios.js remover <email>
  node scripts/usuarios.js listar`);
}
