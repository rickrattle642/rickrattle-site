// /api/universidade/admin.js
//
// Dispatcher único, por ?action=... — mesmo padrão do Barraca da Feira.
// Fala DIRETAMENTE com a API REST do Upstash via fetch, sem depender de
// nenhum pacote npm instalado (evita o erro "Cannot find package").
//
// Ações:
//   ?action=carregar_perguntas&key=XXX
//   ?action=proxima_pergunta&key=XXX
//   ?action=submeter_resposta&key=XXX&user=NOME&message=TEXTO
//   ?action=fechar_ronda&key=XXX
//   ?action=dar_notas&key=XXX&user=NOME&notas=10   (botão manual de emergência)
//
// Variáveis de ambiente necessárias no Vercel:
//   UPSTASH_REDIS_REST_URL
//   UPSTASH_REDIS_REST_TOKEN
//   UNIVERSIDADE_ADMIN_KEY

import { questionsData } from './questions-data.js';

const PREFIX = 'universidade:';
const SEGUNDOS_EXIBIDOS = 30; // o que o relógio no quadro mostra
const MARGEM_ANIMACAO_MS = 8_000; // tempo da animação de giz antes do timer visual arrancar
const DURACAO_RONDA_MS = SEGUNDOS_EXIBIDOS * 1000 + MARGEM_ANIMACAO_MS; // janela real de aceitação (mais generosa)
const NOTA_POR_ACERTO = 10;

// ---------------------------------------------------------------
// Helper: fala com a API REST do Upstash sem nenhum pacote externo
// ---------------------------------------------------------------
async function redisCmd(...args) {
  const resp = await fetch(process.env.UPSTASH_REDIS_REST_URL, {
    method: 'POST',
    headers: {
      Authorization: 'Bearer ' + (process.env.UPSTASH_REDIS_REST_TOKEN),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(args),
  });
  const data = await resp.json();
  if (data.error) throw new Error('Redis error em [' + (args[0]) + ']: ' + (data.error));
  return data.result;
}

async function redisGetJSON(key) {
  const raw = await redisCmd('GET', key);
  return raw ? JSON.parse(raw) : null;
}

async function redisSetJSON(key, value) {
  return redisCmd('SET', key, JSON.stringify(value));
}

function flatArrayToObject(flat) {
  const obj = {};
  for (let i = 0; i < flat.length; i += 2) obj[flat[i]] = flat[i + 1];
  return obj;
}

function mesAtual() {
  const d = new Date();
  return (d.getFullYear()) + (String(d.getMonth() + 1).padStart(2, '0'));
}

function normalizarResposta(msg) {
  const matches = (msg || '').trim().toUpperCase().match(/\b[ABCD]\b/g);
  return matches ? matches[matches.length - 1] : null;
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
  const { action, key, user, message, notas } = req.query;

  if (key !== process.env.UNIVERSIDADE_ADMIN_KEY) {
    return res.status(401).json({ ok: false, error: 'chave inválida' });
  }

  try {
    switch (action) {

      // -----------------------------------------------------------
      case 'carregar_perguntas': {
        await redisSetJSON((PREFIX) + 'questions', questionsData);
        await redisCmd('DEL', (PREFIX) + 'questions:used');
        return res.status(200).json({
          ok: true,
          carregadas: questionsData.length,
          disciplinas: [...new Set(questionsData.map(q => q.disciplina))],
        });
      }

      // -----------------------------------------------------------
      case 'proxima_pergunta': {
        const questions = (await redisGetJSON((PREFIX) + 'questions')) || [];
        if (!questions.length) {
          return res.status(500).json({ ok: false, error: 'sem perguntas carregadas no Redis' });
        }

        const usedIds = (await redisCmd('SMEMBERS', (PREFIX) + 'questions:used')) || [];
        const usedSet = new Set(usedIds);
        let disponiveis = questions.filter(q => !usedSet.has(q.id));

        if (disponiveis.length === 0) {
          await redisCmd('DEL', (PREFIX) + 'questions:used');
          disponiveis = questions;
        }

        const escolhida = disponiveis[Math.floor(Math.random() * disponiveis.length)];
        await redisCmd('SADD', (PREFIX) + 'questions:used', escolhida.id);

        const roundId = Date.now();
        const endsAt = roundId + DURACAO_RONDA_MS;

        await redisSetJSON((PREFIX) + 'round:current', {
          roundId,
          endsAt,
          accepting: true,
          ...escolhida,
        });

        return res.status(200).json({
          ok: true,
          roundId,
          pergunta: escolhida.pergunta,
          opcaoA: escolhida.opcaoA,
          opcaoB: escolhida.opcaoB,
          opcaoC: escolhida.opcaoC,
          opcaoD: escolhida.opcaoD,
          respostaCorreta: escolhida.respostaCorreta,
          curiosidade: escolhida.curiosidade,
          segundos: SEGUNDOS_EXIBIDOS,
        });
      }

      // -----------------------------------------------------------
      case 'submeter_resposta': {
        if (!user || !message) {
          return res.status(400).json({ ok: false, error: 'faltam user/message' });
        }
        const round = await redisGetJSON((PREFIX) + 'round:current');
        if (!round || !round.accepting || Date.now() > round.endsAt) {
          return res.status(200).json({ ok: true, registada: false });
        }
        const letra = normalizarResposta(message);
        if (!letra) {
          return res.status(200).json({ ok: true, registada: false });
        }
        const gravou = await redisCmd('HSETNX', (PREFIX) + 'round:' + (round.roundId) + ':answers', user, letra);
        return res.status(200).json({ ok: true, registada: gravou === 1 });
      }

      // -----------------------------------------------------------
      case 'fechar_ronda': {
        const round = await redisGetJSON((PREFIX) + 'round:current');
        if (!round) {
          return res.status(404).json({ ok: false, error: 'sem ronda ativa' });
        }

        await redisSetJSON((PREFIX) + 'round:current', { ...round, accepting: false });

        const respostasFlat = (await redisCmd('HGETALL', (PREFIX) + 'round:' + (round.roundId) + ':answers')) || [];
        const respostas = flatArrayToObject(respostasFlat);
        const letraCorreta = round.respostaCorreta.charAt(0);

        const leaderboardKey = (PREFIX) + 'month:' + (mesAtual()) + ':leaderboard';
        const acertaram = [];
        for (const [nome, letra] of Object.entries(respostas)) {
          if (letra === letraCorreta) {
            await redisCmd('ZINCRBY', leaderboardKey, NOTA_POR_ACERTO, nome);
            acertaram.push(nome);
          }
        }

        const top10raw = (await redisCmd('ZRANGE', leaderboardKey, 0, 9, 'REV', 'WITHSCORES')) || [];
        const top10 = [];
        for (let i = 0; i < top10raw.length; i += 2) {
          top10.push({ nome: top10raw[i], notas: Number(top10raw[i + 1]) });
        }

        return res.status(200).json({
          ok: true,
          totalRespostas: Object.keys(respostas).length,
          acertaram: acertaram.length,
          top10,
          top10Json: JSON.stringify(top10),
        });
      }

      // -----------------------------------------------------------
      case 'dar_notas': {
        if (!user || !notas) {
          return res.status(400).json({ ok: false, error: 'faltam user/notas' });
        }
        const leaderboardKey = (PREFIX) + 'month:' + (mesAtual()) + ':leaderboard';
        const novoTotal = await redisCmd('ZINCRBY', leaderboardKey, Number(notas), user);
        return res.status(200).json({ ok: true, user, novoTotal: Number(novoTotal) });
      }

      // -----------------------------------------------------------
      // Apaga o leaderboard do mês atual (ex: limpar notas de teste
      // antes de ires ao ar a sério). Não toca nas perguntas nem no
      // que já foi usado — só nas notas.
      case 'reset_leaderboard': {
        const leaderboardKey = (PREFIX) + 'month:' + (mesAtual()) + ':leaderboard';
        await redisCmd('DEL', leaderboardKey);
        return res.status(200).json({ ok: true, mensagem: 'Leaderboard do mês atual limpo.' });
      }

      // -----------------------------------------------------------
      // Corrige 1 pergunta já carregada, sem precisar de redeploy.
      // ?action=editar_pergunta&key=XXX&id=GEO-001&campo=curiosidade&valor=Texto novo
      // Campos aceites: pergunta, opcaoA, opcaoB, opcaoC, opcaoD, respostaCorreta, curiosidade
      case 'editar_pergunta': {
        const { id, campo, valor } = req.query;
        const camposValidos = ['pergunta', 'opcaoA', 'opcaoB', 'opcaoC', 'opcaoD', 'respostaCorreta', 'curiosidade'];
        if (!id || !campo || valor === undefined) {
          return res.status(400).json({ ok: false, error: 'faltam id/campo/valor' });
        }
        if (!camposValidos.includes(campo)) {
          return res.status(400).json({ ok: false, error: 'campo inválido. Usa: ' + camposValidos.join(', ') });
        }
        const questions = (await redisGetJSON((PREFIX) + 'questions')) || [];
        const idx = questions.findIndex(q => q.id === id);
        if (idx === -1) {
          return res.status(404).json({ ok: false, error: 'pergunta com esse id não encontrada: ' + id });
        }
        const antes = questions[idx][campo];
        questions[idx][campo] = valor;
        await redisSetJSON((PREFIX) + 'questions', questions);
        return res.status(200).json({
          ok: true,
          id,
          campo,
          antes,
          depois: valor,
          aviso: 'Isto só corrige a cópia no Redis — o ficheiro questions-data.js no repositório continua com o valor antigo. Se recarregares com carregar_perguntas outra vez, esta correção perde-se, a menos que também a apliques no ficheiro.',
        });
      }

      // -----------------------------------------------------------
      default:
        return res.status(400).json({ ok: false, error: 'ação desconhecida: ' + (action) });
    }
  } catch (err) {
    return res.status(500).json({ ok: false, error: String(err) });
  }
}
