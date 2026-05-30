"""Data-source providers and the factory that selects between them.

Importing this package registers the built-in providers as a side effect, so the
factory can resolve them by name. The ``as seed`` re-export form marks the import as
intentional (it runs the module's ``register_provider`` call).
"""

from app.providers import seed as seed  # registers the "seed" provider
