# Verpakking van de daadwerkelijk getraceerde Next-runtime

Lokaal geïmplementeerd en getest; geen deployment of live verificatie.

De koude productiebuild slaagt, maar de oorspronkelijke packager eiste een pnpm-hoistmap die Next 16.3.8 in deze trace niet aanmaakt. De werkelijke standalone-output bevat wel de benodigde runtimepakketten. De packager materialiseert nu uitsluitend die getraceerde dependencygraph. Er wordt niets geïnstalleerd of uit de ongetraceerde workspace overgenomen. Ontbrekende Next-runtime, ontsnappende links en conflicterende resoluties worden afgewezen. Het archief bevat uitsluitend gewone bestanden en mappen, zoals de bestaande deploymentbroker vereist.

De architectuurspecificatie is vóór deze aanpassing bijgewerkt. Poorten, releasepaden, services, autorisatie en promotieprocedure wijzigen niet. Vier uitvoerbare fixtures controleren transitieve pnpm-resolutie zonder hoistmap, een vlakke trace, versieconflicten en een ontsnappende bestandslink. De 25 bestaande broker- en workflowcontroles slagen. De vier fixtures draaien tevens in de gedeelde CI-verificatie vóór het verpakken en starten van het archief.

Het werkelijke archief is gestart met zijn eigen `server.js`. De bestaande archiefcontrole leest de statische bestanden. Daarnaast slaagt de volledige geauthenticeerde takenketen uit fase 11 tegen deze verpakte server, met echte lokale Auth, PostgreSQL en servermutaties. Dit is meer bewijs dan alleen `next start`; het is geen bewijs van een staging- of productiepromotie. De runtimecode voor deze controle is commit `25d658e2`; de verpakkingscorrectie wordt apart vastgelegd. Een definitieve release krijgt opnieuw een build, artefact en attestation voor zijn exacte Git-SHA.

Zie `evidence/standalone-packaging/`.
