import SearchOffIcon from '@mui/icons-material/SearchOff';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Typography from '@mui/material/Typography';
import { colors } from '@/lib/theme';

type EmptyStoriesStateProps = {
  title?: string;
  description?: string;
  actionLabel?: string;
  onAction?: () => void;
  placement?: 'center' | 'results';
};

export function EmptyStoriesState({
  title = 'No stories available.',
  description = 'Try clearing your search or filters to see more recordings.',
  actionLabel,
  onAction,
  placement = 'center',
}: EmptyStoriesStateProps) {
  const isResultsPlacement = placement === 'results';

  return (
    <Box
      sx={{
        flex: 1,
        minHeight: isResultsPlacement ? { xs: 260, md: 360 } : { xs: 260, md: 420 },
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: isResultsPlacement ? { xs: 'center', md: 'flex-start' } : 'center',
        px: { xs: 2, md: 4 },
        pt: isResultsPlacement ? { xs: 5, md: 13 } : { xs: 5, md: 8 },
        pb: { xs: 5, md: 8 },
        textAlign: 'center',
      }}>
      <Box
        sx={{
          maxWidth: 420,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 1.5,
        }}>
        <Box
          aria-hidden="true"
          sx={{
            width: 64,
            height: 64,
            borderRadius: '50%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: colors.primary.main,
            bgcolor: 'rgba(25, 118, 210, 0.1)',
            border: `1px solid ${colors.common.border}`,
          }}>
          <SearchOffIcon sx={{ fontSize: 30 }} />
        </Box>
        <Typography
          variant="h5"
          color="text.primary"
          sx={{
            fontSize: { xs: '1.25rem', md: '1.45rem' },
            fontWeight: 700,
            lineHeight: 1.25,
          }}>
          {title}
        </Typography>
        <Typography
          variant="body1"
          color="text.secondary"
          sx={{
            fontSize: { xs: '0.95rem', md: '1rem' },
            lineHeight: 1.6,
          }}>
          {description}
        </Typography>
        {actionLabel && onAction && (
          <Button
            variant="contained"
            onClick={onAction}
            sx={{
              mt: 1,
              textTransform: 'none',
              fontWeight: 700,
              borderRadius: '8px',
            }}>
            {actionLabel}
          </Button>
        )}
      </Box>
    </Box>
  );
}
