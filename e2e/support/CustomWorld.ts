import { setWorldConstructor, World, IWorldOptions } from '@cucumber/cucumber';
import { BrowserContext, Page, APIRequestContext } from '@playwright/test';

export class CustomWorld extends World {
  context?: BrowserContext;
  page?: Page;
  apiContext?: APIRequestContext;

  // We can also store variables here to share between steps in a single scenario!
  response?: any;
  responseBody?: any;

  constructor(options: IWorldOptions) {
    super(options);
  }
}

setWorldConstructor(CustomWorld);
