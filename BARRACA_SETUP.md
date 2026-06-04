# Barraca da Feira — Setup Guide

App para gerir a competição da stream **Barraca da Feira** em rickrattle.com.

## URLs

| Página | Path | Quem vê |
|---|---|---|
| Público (leaderboard live) | `/barraca` | Toda a gente |
| Admin (controlo da stream) | `/barraca/admin` | Só tu (password) |
| OBS Overlay | `/barraca/overlay` | OBS Browser Source |

## Setup — 5 minutos

### 1) Cria conta Upstash (Redis grátis)

1. Vai a [upstash.com](https://upstash.com) → **Login with GitHub**
2. Console → **Create Database**
3. Region: **`eu-west-1`** (mais perto, mais rápido)
4. Type: **Regional** (free tier)
5. Name: `rickrattle-barraca` (qualquer nome)
6. Click **Create**

### 2) Copia as credenciais

Na página do database criado, vais ver duas variáveis em **REST API**:

```
UPSTASH_REDIS_REST_URL    → https://xxx-xxx-xxx.upstash.io
UPSTASH_REDIS_REST_TOKEN  → ATSxxxx... (token longo)
```

### 3) Mete as vars no Vercel

1. Vercel Dashboard → projeto rickrattle.com → **Settings → Environment Variables**
2. Adiciona estas 3 vars (TODAS no scope **Production + Preview + Development**):

| Name | Value |
|---|---|
| `UPSTASH_REDIS_REST_URL` | (a URL do passo 2) |
| `UPSTASH_REDIS_REST_TOKEN` | (o token do passo 2) |
| `BARRACA_ADMIN_PASSWORD` | (uma password à tua escolha) |

**Importante:** a `BARRACA_ADMIN_PASSWORD` é o que vais usar para entrar em `/barraca/admin`. Põe algo que só tu saibas. Podes mudá-la a qualquer altura nesta página.

### 4) Push & deploy

```bash
git add .
git commit -m "Add Barraca da Feira"
git push
```

Vercel auto-deploya. Espera 30s e abre `rickrattle.com/barraca`.

### 5) Adiciona ao OBS

1. OBS → **Sources** → **+** → **Browser**
2. URL: `https://rickrattle.com/barraca/overlay`
3. Width: **480** · Height: **720** (ou ajusta ao teu layout)
4. **CSS personalizado (opcional)**: já está com fundo transparente, podes posicionar onde quiseres no stream
5. Refresh: a página actualiza sozinha a cada 3s

## Como funciona

### Workflow durante a stream

1. **Antes da stream**: abre `/barraca/admin` no telemóvel ou segundo monitor → click **▶ Nova Stream** (limpa leaderboard)
2. **Durante**: cada lançamento de bola → escreves o nome no campo, click no botão correspondente (+10/+20/+50/+100/etc.). 2 cliques por lançamento.
3. **Fim da stream**: **⏹ Fechar Stream** → arquiva o campeão no histórico

### House Record

Actualiza-se **automaticamente** sempre que alguém ultrapassa o recorde histórico. Não precisas de fazer nada — o sistema vê o leader actual e compara com o record. Se beats, é dele.

### Histórico

Cada **Fechar Stream** arquiva:
- Data
- Campeão (nome + pontuação)
- Top 10 da sessão

Mostra-se em `/barraca` ao lado do live.

## API endpoints (caso queiras automatizar mais tarde)

Todos retornam JSON. Admin endpoints exigem header `X-Admin-Password`.

### Público (sem auth)

```
GET /api/barraca/state
→ { current: {...}, record: {...}, history: [...] }
```

### Admin (header X-Admin-Password obrigatório)

```
POST /api/barraca/score
Body: { player: "masha", delta: 100 }
ou:    { player: "masha", set: 750 }
ou:    { player: "masha", remove: true }
→ { success, newScore, position, recordUpdated }

POST /api/barraca/end-stream
→ { success, archived: {name, score} }

POST /api/barraca/reset
Body: { startNew: true }   (opcional)
→ { success }
```

## Troubleshooting

**"Upstash Redis env vars missing"** → revê passo 3. As env vars têm de estar no scope correcto + faz redeploy.

**Password errada no admin** → A password é exactamente o que puseste em `BARRACA_ADMIN_PASSWORD` no Vercel. Sem espaços extras.

**Pontos não actualizam no público** → A página pública faz poll a cada 5s. Espera 5 segundos. Se persiste, abre devtools → console e olha para erros.

**OBS overlay com fundo branco** → Em OBS, click nas propriedades da Browser Source → "Custom CSS" → adiciona `body { background: transparent !important; }`. Mas a página já tem isso aplicado, deve funcionar out-of-the-box.

**Stream offline mostra dados antigos** → Comportamento normal. O `/barraca` mostra a última leaderboard fechada até iniciares uma nova stream.

## Free tier limits

Upstash free tier:
- 10.000 comandos Redis por dia
- 256 MB de storage
- Para esta app: cada poll = 3 reads. Com 100 viewers a fazer poll de 5/5s = 60 reads/min × 100 = 6.000 reads/min. **Vais exceder em ~2 horas**.

**Se a stream cresce muito, opta por uma destas mitigations:**
1. Aumentar `POLL_MS` em `/barraca/index.html` de 5000 para 15000 (3x menos requests)
2. Mover para Upstash Pro ($10/mês = 100k requests/dia)
3. Adicionar Vercel KV cache em frente dos endpoints

Por agora (audiência pequena/média), **free tier chega bem**.
