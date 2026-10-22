import { expect, test } from '@playwright/test'

test( 'the home page loads with the submit form', async ( { page } ) => {
  await page.goto( '/' )

  await expect( page.getByRole( 'form', { name: 'Add a video or article' } ) ).toBeVisible()
  await expect( page.getByLabel( 'URL' ) ).toBeVisible()
} )
