import {expect,type Page} from '@playwright/test';

/** Use the supplied source disclosure, including a retained cosmetic open state. */
export async function openSourceFilters(page:Page,advanced?:'Meer mogelijkheden'|'Meer filters'){
 const filter=page.locator('details.ed-filter:visible').first();
 await expect(filter.locator(':scope>summary')).toBeVisible();
 if(!(await filter.evaluate(el=>(el as HTMLDetailsElement).open)))await filter.locator(':scope>summary').click();
 if(advanced){
  const summary=filter.getByText(advanced,{exact:true});await expect(summary).toBeVisible();
  if(!(await summary.locator('..').evaluate(el=>(el as HTMLDetailsElement).open)))await summary.click();
 }
 return filter;
}
