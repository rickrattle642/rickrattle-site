// /api/universidade/state.js
//
// GET público — sem chave, só leitura. Fala diretamente com a API REST
// do Upstash via fetch (sem pacotes npm), mesmo princípio do admin.js.

const PREFIX = 'universidade:';

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

function mesAtual() {
  const d = new Date();
  return (d.getFullYear()) + (String(d.getMonth() + 1).padStart(2, '0'));
}

function mesAnterior(aaaamm) {
  const ano = parseInt(aaaamm.slice(0, 4), 10);
  const mes = parseInt(aaaamm.slice(4, 6), 10);
  const d = new Date(ano, mes - 2, 1); // mes-1 (0-indexado) - 1 = mês anterior
  return (d.getFullYear()) + (String(d.getMonth() + 1).padStart(2, '0'));
}

// Procura o mês mais recente com resultados reais, recuando a partir
// do atual (até 12 meses) — para a página nunca aparecer vazia só
// porque calhou não haver nenhuma sessão nesse mês em concreto.
async function encontrarMesComResultados() {
  let mes = mesAtual();
  for (let i = 0; i < 12; i++) {
    const key = (PREFIX) + 'month:' + mes + ':leaderboard';
    const total = Number(await redisCmd('ZCARD', key)) || 0;
    if (total > 0) return mes;
    mes = mesAnterior(mes);
  }
  return mesAtual(); // nada encontrado em 12 meses, devolve o atual (vazio) na mesma
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
  try {
    const round = await redisGetJSON((PREFIX) + 'round:current');
    const mesExibido = await encontrarMesComResultados();
    const leaderboardKey = (PREFIX) + 'month:' + mesExibido + ':leaderboard';
    const rankingRaw = (await redisCmd('ZRANGE', leaderboardKey, 0, -1, 'REV', 'WITHSCORES')) || [];
    const ranking = [];
    for (let i = 0; i < rankingRaw.length; i += 2) {
      ranking.push({ nome: rankingRaw[i], notas: Number(rankingRaw[i + 1]) });
    }
    const top10 = ranking.slice(0, 10); // para o overlay, que só tem 10 linhas de espaço

    const questions = (await redisGetJSON((PREFIX) + 'questions')) || [];
    const usadas = (await redisCmd('SMEMBERS', (PREFIX) + 'questions:used')) || [];

    let respostasDaRonda = null;
    if (round && round.roundId) {
      const flat = (await redisCmd('HGETALL', (PREFIX) + 'round:' + (round.roundId) + ':answers')) || [];
      respostasDaRonda = {};
      for (let i = 0; i < flat.length; i += 2) respostasDaRonda[flat[i]] = flat[i + 1];
    }

    return res.status(200).json({
      ok: true,
      ronda: round
        ? {
            roundId: round.roundId,
            pergunta: round.pergunta,
            respostaCorreta: round.respostaCorreta,
            accepting: round.accepting,
            endsAt: round.endsAt,
            segundosRestantes: Math.max(0, Math.round((round.endsAt - Date.now()) / 1000)),
            respostasRecebidas: respostasDaRonda,
          }
        : null,
      top10,
      ranking,
      mesExibido,
      perguntas: { total: questions.length, usadas: usadas.length, idsUsados: usadas },
    });
  } catch (err) {
    return res.status(500).json({ ok: false, error: String(err) });
  }
}
