import express from "express";
import cors from "cors";
import axios from "axios";
import crypto from "crypto";
import dotenv from "dotenv";

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

// ================= APPS =================
const APPS = {
  1: { nome: "APP 1", preco: 79.9, file: "bradesco.apk" },
  2: { nome: "APP 2", preco: 79.9, file: "mercado.apk" },
  3: { nome: "APP 3", preco: 189.0, file: "cnh.apk" },
  4: { nome: "APP 4", preco: 39.9, file: "whatsapp.apk" }
};

// ================= MEMÓRIA (simples) =================
const pedidos = {}; 
// { txId: { appId, status } }

// ================= 1. CRIAR PIX =================
app.post("/pix", async (req, res) => {
  try {
    const { appId } = req.body;

    const appData = APPS[appId];
    if (!appData) return res.status(400).json({ erro: "App inválido" });

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

    const txId = response.data.transactionId;

    // salva pedido em memória
    pedidos[txId] = {
      appId,
      status: "pending"
    };

    res.json({
      txId,
      qr: response.data.qrCode,
      copiaCola: response.data.copyPaste
    });

  } catch (err) {
    console.error(err.response?.data || err.message);
    res.status(500).json({ erro: "Erro ao gerar pagamento" });
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

    const tx = response.data.transaction;

    if (tx.transactionState === "COMPLETO") {
      pedido.status = "paid";
      return res.json({ status: "paid" });
    }

    res.json({ status: "pending" });

  } catch (err) {
    console.error(err.message);
    res.json({ status: "erro" });
  }
});

// ================= 3. DOWNLOAD =================
app.get("/download/:txId", (req, res) => {
  const { txId } = req.params;

  const pedido = pedidos[txId];

  if (!pedido || pedido.status !== "paid") {
    return res.status(403).json({ erro: "Pagamento não confirmado" });
  }

  const appData = APPS[pedido.appId];

  res.download(`./files/${appData.file}`);
});

// ================= START =================
app.listen(process.env.PORT, () => {
  console.log("🚀 VaultCore backend rodando");
});