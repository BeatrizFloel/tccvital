import express from "express"
import cors from "cors"
import mysql2 from "mysql2"

const app = express()

app.use(express.json())

app.use(cors())

const users = [];

// Chave secreta para assinar os tokens (guarde isso em variáveis de ambiente, num arquivo .env)
const SECRET_KEY = 'sua_chave_secreta_super_segura';

// ==========================================
// Rota de Cadastro (POST)
// ==========================================
app.post('/cadastro', async (req, res) => {
  const { email, password } = req.body;

  // 1. Verifica se os dados foram enviados
  if (!email || !password) {
    return res.status(400).json({ message: 'E-mail e senha são obrigatórios.' });
  }

  // 2. Verifica se o usuário já existe
  const userExists = users.find(u => u.email === email);
  if (userExists) {
    return res.status(400).json({ message: 'Usuário já cadastrado.' });
  }

  try {
    // 3. Criptografa a senha antes de salvar (nunca salve senhas em texto puro)
    const saltRounds = 10;
    const hashedPassword = await bcrypt.hash(password, saltRounds);
    
    // 4. Salva o novo usuário
    const newUser = { 
      id: Date.now(), 
      email, 
      password: hashedPassword 
    };
    users.push(newUser);

    res.status(201).json({ message: 'Usuário criado com sucesso!' });
  } catch (error) {
    res.status(500).json({ message: 'Erro interno ao criar usuário.' });
  }
});

// ==========================================
// Rota de Login (POST)
// ==========================================
app.post('/login', async (req, res) => {
  const { email, password } = req.body;

  // 1. Busca o usuário pelo e-mail
  const user = users.find(u => u.email === email);
  if (!user) {
    return res.status(404).json({ message: 'Usuário não encontrado.' });
  }

  try {
    // 2. Compara a senha enviada na requisição com a senha criptografada salva
    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      return res.status(401).json({ message: 'Senha incorreta.' });
    }

    // 3. Gera o token JWT para manter o usuário logado
    const token = jwt.sign(
      { userId: user.id, email: user.email }, 
      SECRET_KEY, 
      { expiresIn: '1h' } // O token expira em 1 hora
    );

    res.status(200).json({ 
      message: 'Login bem-sucedido!', 
      token 
    });
  } catch (error) {
    res.status(500).json({ message: 'Erro interno ao fazer login.' });
  }
});

app.listen(3000, ()=>{
    console.log("Servidor ligado")
})