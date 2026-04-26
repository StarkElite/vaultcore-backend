import express from "express";
import cors from "cors";
import axios from "axios";
import crypto from "crypto";
import dotenv from "dotenv";

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 3000;

// ================= APPS =================
const APPS = {
  1: { nome: "Bradesco Gold", preco: 80.0, file: "bradesco.apk" },
  2: { nome: "MercadoGold", preco: 79.9, file: "mercado.apk" },
  3: { nome: "CNH Digital Pro", preco: 189.0, file: "cnh.apk" },
  4: { nome: "WhatsApp GB Pro", preco: 39.9, file: "whatsapp.apk" }
};

const pedidos = {};

// ================= ROOT =================
app.get("/", (req, res) => {
  res.send("VaultCore Backend ONLINE 🚀");
});

// ================= PIX =================
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
        description: `Compra ${appData.nome}`,
        payerName: "Cliente VaultCore",
        payerDocument: "12345678900",
        external_id: externalId
      },
      {
        headers: {
          "x-client-id": process.env.ELITEPAY_CLIENT_ID,
          "x-client-secret": process.env.ELITEPAY_CLIENT_SECRET,
          "Content-Type": "application/json"
        }
      }
    );

    console.log("🔥 ELITEPAY:", response.data);

    const data = response.data;

    const txId = data.transactionId;

    let qrCode = data.qrcodeUrl;
    const copiaCola = data.copyPaste;

    // 🔥 REMOVE "base64:"
    if (qrCode?.startsWith("base64:")) {
      qrCode = qrCode.replace("base64:", "");
    }

    if (!txId || !qrCode || !copiaCola) {
      return res.status(500).json({
        error: "Pix não gerado corretamente",
        raw: data
      });
    }

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

// ================= CHECK =================
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

    const status = response.data.transaction?.transactionState;

    if (status === "COMPLETO") {
      pedido.status = "paid";
      return res.json({ status: "paid" });
    }

    res.json({ status: "pending" });

  } catch (err) {
    console.error(err.message);
    res.json({ status: "error" });
  }
});

// ================= DOWNLOAD =================
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
