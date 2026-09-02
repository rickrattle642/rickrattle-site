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

// -----------------------------------------------------------
// Fecha a ronda atual (se houver uma por fechar) e calcula os
// resultados. Reutilizada tanto pela ação 'fechar_ronda' como,
// automaticamente, pela 'proxima_pergunta' — para nunca se
// perder pontos de uma ronda anterior que ainda não foi fechada
// (ex: cliques demasiado próximos um do outro).
async function fecharRondaAtual() {
  const round = await redisGetJSON(PREFIX + 'round:current');
  if (!round || round.accepting === false) {
    return null; // nada por fechar
  }

  await redisSetJSON(PREFIX + 'round:current', { ...round, accepting: false });

  const respostasFlat = (await redisCmd('HGETALL', PREFIX + 'round:' + round.roundId + ':answers')) || [];
  const respostas = flatArrayToObject(respostasFlat);
  const letraCorreta = round.respostaCorreta.charAt(0);

  const leaderboardKey = PREFIX + 'month:' + mesAtual() + ':leaderboard';
  const acertaram = [];
  for (const [nome, letra] of Object.entries(respostas)) {
    if (letra === letraCorreta) {
      await redisCmd('ZINCRBY', leaderboardKey, NOTA_POR_ACERTO, nome);
      acertaram.push(nome);
    }
  }

  const erradas = Object.keys(respostas).length - acertaram.length;
  if (acertaram.length > 0) await redisCmd('INCRBY', PREFIX + 'stats:respostas_certas', acertaram.length);
  if (erradas > 0) await redisCmd('INCRBY', PREFIX + 'stats:respostas_erradas', erradas);
  await redisCmd('INCR', PREFIX + 'stats:perguntas_fechadas');

  const top10raw = (await redisCmd('ZRANGE', leaderboardKey, 0, 9, 'REV', 'WITHSCORES')) || [];
  const top10 = [];
  for (let i = 0; i < top10raw.length; i += 2) {
    top10.push({ nome: top10raw[i], notas: Number(top10raw[i + 1]) });
  }

  return {
    totalRespostas: Object.keys(respostas).length,
    acertaram: acertaram.length,
    top10,
    top10Json: JSON.stringify(top10),
  };
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
        // Segurança: se a ronda anterior ainda não tiver sido fechada
        // (ex: cliques demasiado próximos), fecha-a agora, para as
        // respostas de lá não se perderem.
        await fecharRondaAtual();

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
        const resultado = await fecharRondaAtual();
        if (!resultado) {
          return res.status(404).json({ ok: false, error: 'sem ronda ativa por fechar' });
        }
        return res.status(200).json({ ok: true, ...resultado });
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
        await redisCmd('DEL', (PREFIX) + 'stats:respostas_certas');
        await redisCmd('DEL', (PREFIX) + 'stats:respostas_erradas');
        await redisCmd('DEL', (PREFIX) + 'stats:perguntas_fechadas');
        return res.status(200).json({ ok: true, mensagem: 'Leaderboard e estatísticas do mês atual limpos.' });
      }

      // -----------------------------------------------------------
      // Migra/junta as notas de um mês para outro (ex: sessão feita
      // a 31 de agosto que devia contar para setembro por causa do
      // calendário). Formato dos meses: AAAAMM (ex: 202608).
      // Soma-se ao que já lá estiver — não apaga nada do destino.
      case 'migrar_mes': {
        const { de, para } = req.query;
        if (!de || !para) {
          return res.status(400).json({ ok: false, error: 'faltam de/para (formato AAAAMM)' });
        }
        const origemKey = (PREFIX) + 'month:' + de + ':leaderboard';
        const destinoKey = (PREFIX) + 'month:' + para + ':leaderboard';
        await redisCmd('ZUNIONSTORE', destinoKey, 2, destinoKey, origemKey);
        const top10raw = (await redisCmd('ZRANGE', destinoKey, 0, 9, 'REV', 'WITHSCORES')) || [];
        const top10 = [];
        for (let i = 0; i < top10raw.length; i += 2) {
          top10.push({ nome: top10raw[i], notas: Number(top10raw[i + 1]) });
        }
        return res.status(200).json({ ok: true, mensagem: `Notas de ${de} juntadas a ${para}.`, top10 });
      }

      // -----------------------------------------------------------
      // Estatísticas gerais — para a página de admin
      case 'stats': {
        const leaderboardKey = (PREFIX) + 'month:' + (mesAtual()) + ':leaderboard';
        const questions = (await redisGetJSON((PREFIX) + 'questions')) || [];
        const usadas = (await redisCmd('SMEMBERS', (PREFIX) + 'questions:used')) || [];
        const certas = Number((await redisCmd('GET', (PREFIX) + 'stats:respostas_certas')) || 0);
        const erradas = Number((await redisCmd('GET', (PREFIX) + 'stats:respostas_erradas')) || 0);
        const perguntasFechadas = Number((await redisCmd('GET', (PREFIX) + 'stats:perguntas_fechadas')) || 0);
        const jogadoresAtivos = await redisCmd('ZCARD', leaderboardKey);
        const round = await redisGetJSON((PREFIX) + 'round:current');

        const top10raw = (await redisCmd('ZRANGE', leaderboardKey, 0, 9, 'REV', 'WITHSCORES')) || [];
        const top10 = [];
        for (let i = 0; i < top10raw.length; i += 2) {
          top10.push({ nome: top10raw[i], notas: Number(top10raw[i + 1]) });
        }

        return res.status(200).json({
          ok: true,
          perguntas: { total: questions.length, usadas: usadas.length, porUsar: questions.length - usadas.length },
          respostas: { certas, erradas, total: certas + erradas },
          taxaAcerto: (certas + erradas) > 0 ? Math.round((certas / (certas + erradas)) * 100) : null,
          perguntasFechadas,
          jogadoresAtivos: Number(jogadoresAtivos) || 0,
          rondaAtual: round ? { pergunta: round.pergunta, accepting: round.accepting } : null,
          top10,
        });
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
