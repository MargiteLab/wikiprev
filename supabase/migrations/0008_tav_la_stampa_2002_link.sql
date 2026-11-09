-- WikiPrev: link to the La Stampa archive page for the six Torino-Lione
-- predictions added in 0007 (La Stampa, 17 March 2002, page 20).
-- Only fills the link where it is still empty, so it is safe to run again.

update public.predictions
   set source_url = 'http://www.archiviolastampa.it/component/option,com_lastampa/task,search/mod,libera/action,viewer/Itemid,3/page,20/articleid,0266_01_2002_0074_0022_2006045/'
 where legacy_id in (
           'seed-v8-tav-2002-ratifica-italia',
           'seed-v8-tav-2002-studio-2003',
           'seed-v8-tav-2002-cantieri-francia-2004',
           'seed-v8-tav-2002-lavori-italia-2005',
           'seed-v8-tav-2002-fine-lavori-2012',
           'seed-v8-tav-2002-servizio-2013'
       )
   and source_url is null;
