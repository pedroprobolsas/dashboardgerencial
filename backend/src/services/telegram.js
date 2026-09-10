'use strict';

/**
 * Servicio de integracin con Telegram usando fetch nativo.
 */
async function enviarAlerta(mensaje) {
  const token = process.env.TELEGRAM_BOT_TOKEN_ALERTS;
  const chatId = process.env.TELEGRAM_CHAT_ID_ALERTS;

  if (!token || !chatId) {
    console.warn('[TELEGRAM] Faltan variables de entorno TELEGRAM_BOT_TOKEN_ALERTS o TELEGRAM_CHAT_ID_ALERTS. Omitiendo envo.');
    return false;
  }

  const url = `https://api.telegram.org/bot${token}/sendMessage`;

  const body = {
    chat_id: chatId,
    text: mensaje,
    parse_mode: 'HTML'
  };

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[TELEGRAM] Error al enviar alerta. Status: ${response.status}. Detalle: ${errorText}`);
      return false;
    }

    console.log('[TELEGRAM] Alerta enviada correctamente');
    return true;
  } catch (err) {
    console.error('[TELEGRAM] Excepcin al enviar alerta:', err.message);
    return false; // No lanza excepcin para no tumbar el cron
  }
}

module.exports = {
  enviarAlerta
};
