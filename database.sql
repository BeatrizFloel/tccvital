CREATE TABLE IF NOT EXISTS vital_care (
  id_usuario INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  nome VARCHAR(120) NOT NULL,
  email VARCHAR(150) NOT NULL UNIQUE,
  senha VARCHAR(255) NOT NULL,
  data_cadastro DATE NOT NULL
);

-- Tabelas do dashboard (o servidor também cria sozinho na primeira vez que o painel é aberto)
CREATE TABLE IF NOT EXISTS vc_medicamentos (
  id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  id_usuario INT NOT NULL,
  nome VARCHAR(120) NOT NULL,
  dose VARCHAR(60) NULL,
  horario VARCHAR(5) NOT NULL,
  tomado_em DATE NULL,
  criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_med_usuario (id_usuario)
);

CREATE TABLE IF NOT EXISTS vc_consultas (
  id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  id_usuario INT NOT NULL,
  titulo VARCHAR(120) NOT NULL,
  medico VARCHAR(120) NULL,
  data DATE NOT NULL,
  horario VARCHAR(5) NOT NULL,
  criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_consulta_usuario (id_usuario)
);

CREATE TABLE IF NOT EXISTS vc_lembretes (
  id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  id_usuario INT NOT NULL,
  titulo VARCHAR(120) NOT NULL,
  detalhe VARCHAR(200) NULL,
  horario VARCHAR(5) NOT NULL,
  criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_lembrete_usuario (id_usuario)
);

-- Localização da casa (do monitor), usada para buscar o clima
CREATE TABLE IF NOT EXISTS vc_locais (
  id_usuario INT NOT NULL PRIMARY KEY,
  latitude DECIMAL(9,6) NOT NULL,
  longitude DECIMAL(9,6) NOT NULL,
  cidade VARCHAR(120) NULL,
  atualizado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- Histórico de leituras do sensor de gás
CREATE TABLE IF NOT EXISTS vc_leituras_gas (
  id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  id_usuario INT NOT NULL,
  ppm DECIMAL(8,2) NOT NULL,
  lido_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_gas_usuario (id_usuario, lido_em)
);

-- Histórico do sensor cardíaco / oxímetro (batimentos por minuto e saturação de oxigênio)
CREATE TABLE IF NOT EXISTS vc_leituras_cardiacas (
  id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  id_usuario INT NOT NULL,
  bpm DECIMAL(5,1) NULL,
  spo2 DECIMAL(4,1) NULL,
  lido_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_cardiaca_usuario (id_usuario, lido_em)
);

-- Histórico do sensor de temperatura do ambiente (umidade é opcional, ex.: DHT11/DHT22)
CREATE TABLE IF NOT EXISTS vc_leituras_temperatura (
  id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  id_usuario INT NOT NULL,
  celsius DECIMAL(5,2) NOT NULL,
  umidade DECIMAL(5,2) NULL,
  lido_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_temperatura_usuario (id_usuario, lido_em)
);
