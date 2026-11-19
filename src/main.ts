import { bootstrapApplication } from '@angular/platform-browser';
import { appConfig } from './app/app.config';
import { App } from './app/app';
import { useGermanZodMessages } from './app/core/zod-messages';

// Zod's configuration is global, not part of DI, so it is set before the app starts.
useGermanZodMessages();

bootstrapApplication(App, appConfig).catch((err) => console.error(err));
