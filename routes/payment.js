import express from "express";
import * as paymentController from "../controllers/paymentController.js";
import { resolveStore } from "../middlewares/storeAuth.js";

const router = express.Router();

// Todas as rotas de pagamento usam uma loja fixa (single-tenant)

// PIX
router.post("/create-pix", resolveStore, paymentController.createPix);

// Cartão via Point
router.post("/create", resolveStore, paymentController.createCard);

// Status
router.get("/status/:paymentId", resolveStore, paymentController.checkStatus);

// Cancelar
router.delete("/cancel/:paymentId", resolveStore, paymentController.cancel);

// Point - Configuração
router.post("/point/configure", resolveStore, paymentController.configurePoint);

// Point - Status
router.get("/point/status", resolveStore, paymentController.getPointStatus);

// Limpar fila
router.post("/clear-queue", resolveStore, paymentController.clearQueue);

export default router;
