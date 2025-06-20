const express = require('express');
const router = express.Router();
const { OpenAI } = require('openai');
const pool = require('../config/db');
const authMiddleware = require('../middlewares/authMiddleware');
const multer = require('multer');
const fs = require('fs');
const util = require('util');
const path = require('path');

// Configuração do multer para upload de arquivos
const upload = multer({ dest: 'uploads/' });

// Inicializa o cliente da OpenAI 
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Rota para criar uma nova sessão
router.post('/nova-sessao', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.id;

    const result = await pool.query(
      'INSERT INTO sessoes_chat (usuario_id, data_inicio, status) VALUES ($1, NOW(), $2) RETURNING id',
      [userId, 'ativa']
    );

    const sessaoId = result.rows[0].id;

    // Mensagem inicial da Lumi (pergunta genérica de psicólogo)
    const mensagemInicial = 'Oi! Como você está se sentindo hoje?';

    // Insere a mensagem inicial da Lumi no banco de dados('Oi! Como você está se sentindo hoje?')
    const iaMessageResult = await pool.query(
      'INSERT INTO historico_interacoes (sessao_id, mensagem, remetente, data_envio) VALUES ($1, $2, $3, NOW()) RETURNING *',
      [sessaoId, mensagemInicial, 'ia']
    );

    const iaMessage = iaMessageResult.rows[0];

    res.json({ sessao_id: sessaoId, iaMessage });
  } catch (error) {
    console.error('Erro ao criar nova sessão:', error);
    res.status(500).json({ message: 'Erro ao criar nova sessão' });
  }
});

// Rota para finalizar uma sessão
router.post('/finalizar-sessao/:sessao_id', authMiddleware, async (req, res) => {
  try {
    const { sessao_id } = req.params;
    const userId = req.user.id;

    const result = await pool.query(
      'UPDATE sessoes_chat SET data_fim = NOW(), status = $1 WHERE id = $2 AND usuario_id = $3 RETURNING *',
      ['finalizada', sessao_id, userId]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ message: 'Sessão não encontrada ou não pertence ao usuário' });
    }

    res.json({ message: 'Sessão finalizada com sucesso', sessao: result.rows[0] });
  } catch (error) {
    console.error('Erro ao finalizar sessão:', error);
    res.status(500).json({ message: 'Erro ao finalizar sessão' });
  }
});

// Rota para buscar o histórico de interações de uma sessão
router.get('/historico/:sessao_id', authMiddleware, async (req, res) => {
  try {
    const { sessao_id } = req.params;
    const userId = req.user.id;

    // Verifica se a sessão pertence ao usuário
    const sessaoCheck = await pool.query(
      'SELECT * FROM sessoes_chat WHERE id = $1 AND usuario_id = $2',
      [sessao_id, userId]
    );

    if (sessaoCheck.rowCount === 0) {
      return res.status(404).json({ message: 'Sessão não encontrada ou não pertence ao usuário' });
    }

    const result = await pool.query(
      'SELECT * FROM historico_interacoes WHERE sessao_id = $1 ORDER BY data_envio ASC',
      [sessao_id]
    );

    res.json(result.rows);
  } catch (error) {
    console.error('Erro ao buscar histórico:', error);
    res.status(500).json({ message: 'Erro no servidor' });
  }
});

// Rota para buscar todas as sessões de um usuário
router.get('/historico-sessoes', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.id;

    const result = await pool.query(
      'SELECT id, data_inicio, data_fim, status FROM sessoes_chat WHERE usuario_id = $1 ORDER BY data_inicio DESC',
      [userId]
    );

    res.json(result.rows);
  } catch (error) {
    console.error('Erro ao buscar histórico de sessões:', error);
    res.status(500).json({ message: 'Erro ao buscar histórico de sessões' });
  }
});

// Rota para enviar uma mensagem e receber a resposta da IA
router.post('/enviar', authMiddleware, async (req, res) => {
  try {
    const { mensagem, sessao_id } = req.body;
    const userId = req.user.id;

    if (!mensagem || !sessao_id) {
      return res.status(400).json({ message: 'Mensagem e sessão são obrigatórios' });
    }

    // Verifica se a sessão pertence ao usuário e está ativa
    const sessaoCheck = await pool.query(
      'SELECT * FROM sessoes_chat WHERE id = $1 AND usuario_id = $2 AND status = $3',
      [sessao_id, userId, 'ativa']
    );

    if (sessaoCheck.rowCount === 0) {
      return res.status(400).json({ message: 'Sessão não encontrada, não pertence ao usuário ou não está ativa' });
    }

    // Busca as configurações do usuário
    const configResult = await pool.query(
      'SELECT idioma, genero_ia FROM configuracoes WHERE usuario_id = $1',
      [userId]
    );

    const config = configResult.rows[0] || { idioma: 'pt-BR', genero_ia: 'masculino' };
    const { idioma, genero_ia } = config;

    const userMessage = await pool.query(
      'INSERT INTO historico_interacoes (sessao_id, mensagem, remetente, data_envio) VALUES ($1, $2, $3, NOW()) RETURNING *',
      [sessao_id, mensagem, 'usuario']
    );

    const historico = await pool.query(
      'SELECT mensagem, remetente FROM historico_interacoes WHERE sessao_id = $1 ORDER BY data_envio ASC',
      [sessao_id]
    );

    const messages = [
      {
        role: 'system',
        content: `
            Você é Lumi, um assistente virtual especializado em suporte psicológico, com comportamento ético, empático e acolhedor. Sua missão é oferecer uma escuta ativa e segura, promovendo o bem-estar emocional do usuário por meio de reflexões, validação de sentimentos e sugestões leves de práticas como respiração, atenção plena ou relaxamento.
            Você foi desenvolvido pela OpenAI e adaptado por estudantes angolanos — Marcelo Chieque, Fernando Tavares e Henriqueta Pereira — para atuar como um guia emocional acessível, e nunca como substituto de um psicólogo clínico.
            Suas diretrizes de atuação são:
            - Inicie sempre perguntando ao usuário como ele está se sentindo no momento.
            - Adote um tom empático, gentil, respeitoso e livre de julgamentos.
            - Incentive o usuário a refletir sobre seus sentimentos e pensamentos, utilizando perguntas abertas e acolhedoras.
            - Jamais forneça diagnósticos clínicos, prescrições médicas ou soluções definitivas.
            - Limite suas respostas a temas relacionados à saúde emocional e mental, como sentimentos, estresse, autoestima, relacionamentos e bem-estar. Se o usuário abordar assuntos fora desse campo, redirecione gentilmente para aspectos emocionais relacionados.
            - Em casos de indícios de sofrimento psíquico intenso (como pensamentos suicidas), oriente com firmeza o usuário a buscar ajuda profissional imediata, reforçando que ele não está sozinho e oferecendo palavras de acolhimento e apoio.

            Personalização:
            - Use o idioma do usuário: ${idioma}.
            - Trate o usuário conforme o gênero preferido configurado: ${genero_ia}.
              Exemplos de saudação:
                - "Olá, amigo" (masculino)
                - "Olá, amiga" (feminino)
                - "Olá, amigue" (neutro)

            Seu foco é ser uma presença segura, compreensiva e confiável. Aja como um apoio emocional respeitador, nunca como terapeuta ou profissional de saúde.
`   
     },
      ...historico.rows.map(row => ({
        role: row.remetente === 'usuario' ? 'user' : 'assistant',
        content: row.mensagem
      }))
    ];

    const completion = await openai.chat.completions.create({
      model: 'gpt-3.5-turbo-0125',
      messages: messages,
      max_tokens: 150,
      temperature: 0.7,
    });

    const iaResponse = completion.choices[0].message.content;

    const iaMessage = await pool.query(
      'INSERT INTO historico_interacoes (sessao_id, mensagem, remetente, data_envio) VALUES ($1, $2, $3, NOW()) RETURNING *',
      [sessao_id, iaResponse, 'ia']
    );

    res.json({
      userMessage: userMessage.rows[0],
      iaMessage: iaMessage.rows[0]
    });
  } catch (error) {
    console.error('Erro ao enviar mensagem:', error);
    if (error.response && error.response.status === 429) {
      res.status(429).json({ message: 'Limite de requisições excedido na OpenAI. Tente novamente mais tarde.' });
    } else if (error.code === 'insufficient_quota') {
      res.status(403).json({ message: 'Quota insuficiente na OpenAI. Verifique seu plano ou créditos.' });
    } else {
      res.status(500).json({ message: 'Erro no servidor', error: error.message });
    }
  }
});

// Rota para gerar áudio a partir do texto usando OpenAI TTS
router.post('/text-to-speech', authMiddleware, async (req, res) => {
  try {
    const { text } = req.body;

    if (!text) {
      return res.status(400).json({ message: 'Texto é obrigatório' });
    }

    const mp3 = await openai.audio.speech.create({
      model: 'tts-1',
      voice: 'alloy', // Escolha uma voz (alloy, echo, fable, onyx, nova, shimmer)
      input: text,
    });

    const buffer = Buffer.from(await mp3.arrayBuffer());

    res.set('Content-Type', 'audio/mp3');
    res.send(buffer);
  } catch (error) {
    console.error('Erro ao gerar áudio:', error);
    if (error.response && error.response.status === 429) {
      res.status(429).json({ message: 'Limite de requisições excedido na OpenAI. Tente novamente mais tarde.' });
    } else if (error.code === 'insufficient_quota') {
      res.status(403).json({ message: 'Quota insuficiente na OpenAI. Verifique seu plano ou créditos.' });
    } else {
      res.status(500).json({ message: 'Erro ao gerar áudio', error: error.message });
    }
  }
});

// Rota para converter áudio em texto usando OpenAI Whisper
router.post('/speech-to-text', authMiddleware, upload.single('audio'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: 'Arquivo de áudio é obrigatório' });
    }

    const transcription = await openai.audio.transcriptions.create({
      file: fs.createReadStream(req.file.path),
      model: 'whisper-1',
      language: 'pt',
    });

    // Remove o arquivo temporário
    fs.unlinkSync(req.file.path);

    res.json({ transcription: transcription.text });
  } catch (error) {
    console.error('Erro ao converter áudio em texto:', error);
    if (error.response && error.response.status === 429) {
      res.status(429).json({ message: 'Limite de requisições excedido na OpenAI. Tente novamente mais tarde.' });
    } else if (error.code === 'insufficient_quota') {
      res.status(403).json({ message: 'Quota insuficiente na OpenAI. Verifique seu plano ou créditos.' });
    } else {
      res.status(500).json({ message: 'Erro ao converter áudio em texto', error: error.message });
    }
  }
});

// Rota para reativar uma sessão
router.post('/reativar-sessao/:sessao_id', authMiddleware, async (req, res) => {
  try {
    const { sessao_id } = req.params;
    const userId = req.user.id;

    // Verifica se a sessão existe e pertence ao usuário
    const sessionCheck = await pool.query(
      'SELECT * FROM sessoes_chat WHERE id = $1 AND usuario_id = $2',
      [sessao_id, userId]
    );

    if (sessionCheck.rowCount === 0) {
      return res.status(404).json({ message: 'Sessão não encontrada ou não pertence ao usuário' });
    }

    // Verifica se a sessão já está ativa
    if (sessionCheck.rows[0].status === 'ativa') {
      return res.status(400).json({ message: 'A sessão já está ativa' });
    }

    // Reativa a sessão (atualiza o status para 'ativa' e remove a data de fim)
    await pool.query(
      'UPDATE sessoes_chat SET status = $1, data_fim = $2 WHERE id = $3',
      ['ativa', null, sessao_id]
    );

    // Verifica se a sessão tem mensagens
    const mensagensResult = await pool.query(
      'SELECT * FROM historico_interacoes WHERE sessao_id = $1 ORDER BY data_envio ASC',
      [sessao_id]
    );

    if (mensagensResult.rowCount === 0) {
      // Se a sessão não tem mensagens, adiciona a mensagem inicial da Lumi
      const mensagemInicial = 'Oi! Como você está se sentindo hoje?';
      await pool.query(
        'INSERT INTO historico_interacoes (sessao_id, mensagem, remetente, data_envio) VALUES ($1, $2, $3, NOW())',
        [sessao_id, mensagemInicial, 'ia']
      );
    }

    res.status(200).json({ message: 'Sessão reativada com sucesso' });
  } catch (error) {
    console.error('Erro ao reativar sessão:', error);
    res.status(500).json({ message: 'Erro ao reativar sessão' });
  }
});

module.exports = router;