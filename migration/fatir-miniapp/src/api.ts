const base = (import.meta as any).env.VITE_API_BASE_URL || '';
// Worker ждёт ответ Google Sheets до 65 с, поэтому клиентский таймаут больше.
const TIMEOUT_MS = 75000;
export const api = {
  async post(path: string, body: Record<string, unknown>) {
    if (!base || !/^https:\/\//.test(base)) throw new Error('Не настроен защищённый сервер FATIR (VITE_API_BASE_URL).');
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      const res = await fetch(base.replace(/\/$/, '') + path, {
        method: 'POST', headers: {'Content-Type': 'application/json'},
        body: JSON.stringify(body), cache: 'no-store', credentials: 'omit', signal: controller.signal
      });
      const result = await res.json().catch(() => ({error:'Некорректный ответ сервера FATIR'}));
      if (!res.ok) {
        const err = new Error(result.error || 'Ошибка сервера FATIR');
        (err as any).response = {data:result,status:res.status};
        throw err;
      }
      return {data:result};
    } catch (e: any) {
      // Сетевые сбои без ответа сервера: status остаётся пустым, поэтому авто-повтор входа работает как раньше.
      if (e?.name === 'AbortError') throw new Error('Сервер не ответил вовремя. Проверьте соединение и повторите.');
      if (e instanceof TypeError) throw new Error('Нет связи с сервером. Проверьте интернет и повторите.');
      throw e;
    } finally {
      clearTimeout(timer);
    }
  }
};
