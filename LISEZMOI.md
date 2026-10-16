# Le bachelor 2027

Site Netlify : page publique (public/index.html) + fonction de données (netlify/functions/data.mjs, stockage Netlify Blobs) + relais Claude (netlify/edge-functions/generate.js).

Variables d'environnement (Netlify > Site configuration > Environment variables) :
- ADMIN_CODE : code secret de l'organisateur (obligatoire)
- ANTHROPIC_API_KEY : clé API Claude pour le bouton « Générer des idées » (optionnel)
- ANTHROPIC_MODEL : modèle Claude à utiliser (optionnel, défaut claude-sonnet-4-5)

Pour changer la liste d'amis : modifier ROSTER dans public/index.html ET netlify/functions/data.mjs.
