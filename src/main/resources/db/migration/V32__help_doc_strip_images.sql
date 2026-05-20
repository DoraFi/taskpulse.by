-- Удаляем markdown-картинки из статей (файлов нет, только текст)
update help_doc_article
set body_md = trim(both E'\n' from regexp_replace(body_md, E'\n*!\\[[^\\]]*\\]\\([^)]+\\)', '', 'g'))
where body_md ~ E'!\\[';
