"""Sports data provider abstraction."""

from .local import LocalProvider

__all__ = ['LocalProvider', 'get_provider']


def get_provider(name: str = 'local'):
    if name == 'local':
        return LocalProvider()
    raise ValueError(f'Unknown provider: {name}')
