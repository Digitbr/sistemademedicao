const loginForm = document.querySelector("#login-form");
const emailInput = document.querySelector("#login-email");
const passwordInput = document.querySelector("#login-password");
const submitButton = document.querySelector("#login-submit");
const message = document.querySelector("#login-message");
const togglePassword = document.querySelector("#toggle-password");

checkExistingSession();

togglePassword.addEventListener("click", () => {
  const showing = passwordInput.type === "text";
  passwordInput.type = showing ? "password" : "text";
  togglePassword.textContent = showing ? "Mostrar" : "Ocultar";
  togglePassword.setAttribute("aria-pressed", String(!showing));
  passwordInput.focus();
});

loginForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  const email = emailInput.value.trim();
  const password = passwordInput.value;

  if (!email || !password) {
    showMessage("Informe e-mail e senha.");
    (email ? passwordInput : emailInput).focus();
    return;
  }

  submitButton.disabled = true;
  submitButton.textContent = "Entrando...";
  showMessage("");

  try {
    const response = await fetch("/api/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify({ email, password })
    });
    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      throw new Error(data.error || "Não foi possível entrar agora.");
    }

    window.location.replace("/");
  } catch (error) {
    showMessage(error.message || "Não foi possível entrar agora.");
    passwordInput.select();
    submitButton.disabled = false;
    submitButton.textContent = "Entrar";
  }
});

async function checkExistingSession() {
  try {
    const response = await fetch("/api/session", { credentials: "same-origin" });
    if (response.ok) window.location.replace("/");
  } catch {
    // Sem conexão com a API: mantém a tela de login.
  }
}

function showMessage(text) {
  message.textContent = text;
  message.hidden = !text;
}
