import {SiteChrome} from '@/components/site-chrome';
import SignatureHome from '@/components/homes/Signature';
import {makeMetadata,pageMeta,pageSchema,schemaText} from '@/lib/seo';
const meta=pageMeta[''];
export const metadata=makeMetadata('/',meta.title,meta.description,meta.image);
export default function Home(){return <SiteChrome><script type="application/ld+json" dangerouslySetInnerHTML={{__html:schemaText(pageSchema('/',meta.title,meta.description))}}/><SignatureHome concept="signature"/></SiteChrome>}
