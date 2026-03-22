import { registry, type HandlerContext, type HandlerResult } from '../engine/ActivityHandlerRegistry.js';

async function weatherHandler(ctx: HandlerContext): Promise<HandlerResult> {
  const latitude  = (ctx.inputData?.latitude  as number) ?? 51.5074;
  const longitude = (ctx.inputData?.longitude as number) ?? -0.1278;
  const label     = (ctx.inputData?.label     as string) ?? `${latitude},${longitude}`;

  console.log(`[handler:weather] fetching for '${ctx.activityKey}' — ${label}`);
  await new Promise<void>((r) => setTimeout(r, 5000));

  const url =
    `https://api.open-meteo.com/v1/forecast` +
    `?latitude=${latitude}&longitude=${longitude}&current_weather=true`;

  const res = await fetch(url);
  if (!res.ok) throw new Error(`Open-Meteo responded ${res.status}`);

  const data = await res.json() as {
    current_weather: {
      temperature: number;
      windspeed:   number;
      weathercode: number;
      time:        string;
    };
  };

  const w = data.current_weather;
  console.log(`[handler:weather] ${label}: ${w.temperature}°C, wind ${w.windspeed} km/h`);

  return {
    outcome: 'success',
    payload: { label, latitude, longitude, temperature: w.temperature, windspeed: w.windspeed, weathercode: w.weathercode, time: w.time, fetchedAt: new Date().toISOString() },
  };
}

export function registerWeatherHandler(): void {
  registry.register('weather', weatherHandler);
}
