const base = import.meta.env.VITE_API_BASE_URL || '';
export const api = {
  async post(path: string, body: Record<string, unknown>) {
    if (!base || !/^https:\/\//.test(base)) throw new Error('Не настроен защищённый сервер FATIR (VITE_API_BASE_URL).');
    const res = await fetch(base.replace(/\/$/, '') + path, {
      method: 'POST', headers: {'Content-Type': 'application/json'},
      body: JSON.stringify(body), cache: 'no-store', credentials: 'omit'
    });
    const result = await res.json().catch(() => ({error:'Некорректный ответ сервера FATIR'}));
    if (!res.ok) {
      const err = new Error(result.error || 'Ошибка сервера FATIR');
      (err as any).response = {data:result,status:res.status};
      throw err;
    }
    return {data:result};
  }
};
