const TIDE_URL = "https://tablademareas.com/ar/buenos-aires/la-plata";

export default {
  async fetch(request) {
    const url = new URL(request.url);
    if (request.method !== "GET" || url.pathname !== "/api/tides") {
      return new Response("Not found", { status: 404 });
    }

    const date = url.searchParams.get("date") || "";
    const parts = /^([0-9]{4})-([0-9]{2})-([0-9]{2})$/.exec(date);
    if (!parts) return Response.json({ error: "Fecha inválida" }, { status: 400 });
    const year = Number(parts[1]), month = Number(parts[2]), day = Number(parts[3]);
    const parsedDate = new Date(Date.UTC(year, month - 1, day));
    if (year < 2000 || year > 2100 || parsedDate.getUTCFullYear() !== year || parsedDate.getUTCMonth() !== month - 1 || parsedDate.getUTCDate() !== day) {
      return Response.json({ error: "Fecha inválida" }, { status: 400 });
    }

    try {
      const upstream = await fetch(TIDE_URL, {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ fecha: date }).toString(),
      });
      if (!upstream.ok) throw new Error("La fuente de mareas respondió " + upstream.status);
      const html = await upstream.text();
      const requested = [year, month, day];
      let selectedRow = "";
      for (const chunk of html.split('<tr class="tabla_mareas_fila')) {
        const marker = 'onclick="Day(';
        const markerIndex = chunk.indexOf(marker);
        if (markerIndex < 0) continue;
        const dateStart = chunk.indexOf("'", markerIndex) + 1;
        const dateEnd = chunk.indexOf("')", dateStart);
        if (dateStart < 1 || dateEnd < 0) continue;
        const rowParts = chunk.slice(dateStart, dateEnd).split("-").map(Number);
        if (rowParts.length === 3 && rowParts.every((part, index) => part === requested[index])) {
          selectedRow = chunk.split("</tr>")[0];
          break;
        }
      }
      if (!selectedRow) return Response.json({ error: "La fuente no publicó mareas para esa fecha." }, { status: 404 });

      const events = [];
      for (const cell of selectedRow.split('<td class="tabla_mareas_marea ').slice(1)) {
        const cellHtml = cell.split("</td>")[0];
        const timeClassStart = cellHtml.indexOf('class="tabla_mareas_marea_hora');
        if (timeClassStart < 0) continue;
        const classStart = timeClassStart + 7;
        const classEnd = cellHtml.indexOf('"', classStart);
        const tideClass = cellHtml.slice(classStart, classEnd);
        const timeStart = cellHtml.indexOf(">", classEnd) + 1;
        const timeEnd = cellHtml.indexOf("</div>", timeStart);
        if (timeEnd < 0) continue;
        const timeText = cellHtml.slice(timeStart, timeEnd).replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
        const timeMatch = /(\d{1,2}):(\d{2})\s*(am|pm)/i.exec(timeText);
        if (!timeMatch) continue;
        let hour = Number(timeMatch[1]) % 12;
        if (timeMatch[3].toLowerCase() === "pm") hour += 12;
        const heightToken = 'tabla_mareas_marea_altura_numero';
        const heightIndex = cellHtml.indexOf(heightToken);
        let heightMeters = null;
        if (heightIndex >= 0) {
          const heightStart = cellHtml.indexOf(">", heightIndex) + 1;
          const heightEnd = cellHtml.indexOf("<", heightStart);
          const height = Number(cellHtml.slice(heightStart, heightEnd).trim().replace(",", "."));
          if (Number.isFinite(height)) heightMeters = height;
        }
        events.push({ type: tideClass.includes("bajamar") ? "Bajamar" : "Pleamar", time: String(hour).padStart(2, "0") + ":" + timeMatch[2], heightMeters });
      }
      if (!events.length) return Response.json({ error: "No se pudieron leer los horarios de la tabla." }, { status: 502 });
      return Response.json({ date, location: "La Plata, Buenos Aires", events, source: TIDE_URL });
    } catch (error) {
      return Response.json({ error: error instanceof Error ? error.message : "No se pudo consultar la fuente de mareas." }, { status: 502 });
    }
  },
};
