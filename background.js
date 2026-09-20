chrome.runtime.onMessage.addListener((message) => {
    if (message.type !== 'fetch') return;
    return fetch(message.url, message.options).then(async (res) => ({
        ok: res.ok,
        status: res.status,
        data: await res.json()
    }));
});
