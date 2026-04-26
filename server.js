import express from "express";
import cors from "cors";
import axios from "axios";
import crypto from "crypto";
import dotenv from "dotenv";

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

// ================= CONFIG =================
const PORT = process.env.PORT || 3000;

// ================= APPS =================
const APPS = {
  1: { nome: "Bradesco Gold", preco: 79.9, file: "bradesco.apk" },
  2: { nome: "MercadoGold", preco: 79.9, file: "mercado.apk" },
  3: { nome: "CNH Digital Pro", preco: 189.0, file: "cnh.apk" },
  4: { nome: "WhatsApp GB Pro", preco: 39.9, file: "whatsapp.apk" }
};

// ================= MEMÓRIA =================
const pedidos = {}; 
// { txId: { appId, status } }

// ================= HEALTH CHECK =================
app.get("/", (req, res) => {
  res.send("VaultCore Backend ONLINE 🚀");
});

// ================= 1. CRIAR PIX =================
app.post("/pix", async (req, res) => {
  try {
    const { appId } = req.body;

    const appData = APPS[appId];
    if (!appData) {
      return res.status(400).json({ error: "App inválido" });
    }

    const externalId = crypto.randomUUID();

    const response = await axios.post(
      "https://api.elitepaybr.com/api/v1/deposit",
      {
        amount: appData.preco,
        external_id: externalId
      },
      {
        headers: {
          "x-client-id": process.env.ELITEPAY_CLIENT_ID,
          "x-client-secret": process.env.ELITEPAY_CLIENT_SECRET
        }
      }
    );

    console.log("🔥 ELITEPAY RESPONSE:", response.data);

    // 🔥 AJUSTE AQUI (IMPORTANTE)
    const data = response.data;

    const txId =
      data.transactionId ||
      data.id ||
      data.txId;

    const qrCode =
      data.qrCode ||
      data.qr_code ||
      data.pix?.qrCode ||
      data.pix?.qr_code;

    const copiaCola =
      data.copyPaste ||
      data.pixCopyPaste ||
      data.pix?.copyPaste ||
      data.pix?.copiaCola;

    if (!txId) {
      return res.status(500).json({
        error: "Transaction ID não veio",
        raw: data
      });
    }

    if (!qrCode || !copiaCola) {
      return res.status(500).json({
        error: "Pix não gerado corretamente",
        raw: data
      });
    }

    // salva pedido
    pedidos[txId] = {
      appId,
      status: "pending"
    };

    res.json({
      txId,
      qrCode,
      pixCopiaECola: copiaCola
    });

  } catch (err) {
    console.error("❌ ERRO PIX:", err.response?.data || err.message);

    res.status(500).json({
      error: "Erro ao gerar pagamento",
      detail: err.response?.data || err.message
    });
  }
});

// ================= 2. VERIFICAR PAGAMENTO =================
app.get("/check/:txId", async (req, res) => {
  try {
    const { txId } = req.params;

    const pedido = pedidos[txId];
    if (!pedido) return res.json({ status: "not_found" });

    const response = await axios.get(
      "https://api.elitepaybr.com/api/transactions/check",
      {
        params: { transactionId: txId },
        headers: {
          "x-client-id": process.env.ELITEPAY_CLIENT_ID,
          "x-client-secret": process.env.ELITEPAY_CLIENT_SECRET
        }
      }
    );

    console.log("🔎 CHECK:", response.data);

    const tx =
      response.data.transaction ||
      response.data;

    const status =
      tx.transactionState ||
      tx.status;

    if (
      status === "COMPLETO" ||
      status === "PAID" ||
      status === "APPROVED"
    ) {
      pedido.status = "paid";
      return res.json({ status: "paid" });
    }

    res.json({ status: "pending" });

  } catch (err) {
    console.error("❌ ERRO CHECK:", err.message);
    res.json({ status: "error" });
  }
});

// ================= 3. DOWNLOAD =================
app.get("/download/:txId", (req, res) => {
  const { txId } = req.params;

  const pedido = pedidos[txId];

  if (!pedido || pedido.status !== "paid") {
    return res.status(403).json({
      error: "Pagamento não confirmado"
    });
  }

  const appData = APPS[pedido.appId];

  res.download(`./files/${appData.file}`);
});

// ================= START =================
app.listen(PORT, () => {
  console.log(`🚀 VaultCore rodando na porta ${PORT}`);
});
