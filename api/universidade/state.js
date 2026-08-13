// /api/universidade/state.js
//
// GET público — sem chave, só leitura. Fala diretamente com a API REST
// do Upstash via fetch (sem pacotes npm), mesmo princípio do admin.js.

const PREFIX = 'universidade:';

async function redisCmd(...args) {
  const resp = await fetch(process.env.UPSTASH_REDIS_REST_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.UPSTASH_REDIS_REST_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(args),
  });
  const data = await resp.json();
  if (data.error) throw new Error(`Redis error em [${args[0]}]: ${data.error}`);
  return data.result;
}

async function redisGetJSON(key) {
  const raw = await redisCmd('GET', key);
  return raw ? JSON.parse(raw) : null;
}

function mesAtual() {
  const d = new Date();
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export default async function handler(req, res) {
  try {
    const round = await redisGetJSON(`${PREFIX}round:current`);
    const leaderboardKey = `${PREFIX}month:${mesAtual()}:leaderboard`;
    const top10raw = (await redisCmd('ZRANGE', leaderboardKey, 0, 9, 'REV', 'WITHSCORES')) || [];

    const top10 = [];
    for (let i = 0; i < top10raw.length; i += 2) {
      top10.push({ nome: top10raw[i], pontos: Number(top10raw[i + 1]) });
    }

    const questions = (await redisGetJSON(`${PREFIX}questions`)) || [];
    const usadas = (await redisCmd('SMEMBERS', `${PREFIX}questions:used`)) || [];

    return res.status(200).json({
      ok: true,
      ronda: round
        ? {
            pergunta: round.pergunta,
            accepting: round.accepting,
            endsAt: round.endsAt,
            segundosRestantes: Math.max(0, Math.round((round.endsAt - Date.now()) / 1000)),
          }
        : null,
      top10,
      perguntas: { total: questions.length, usadas: usadas.length },
    });
  } catch (err) {
    return res.status(500).json({ ok: false, error: String(err) });
  }
}
